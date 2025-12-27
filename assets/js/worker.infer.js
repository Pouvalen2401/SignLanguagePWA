self.models = { ready: false, engine: null }; // engine: 'mediapipe'|'tfjs'
self.baselines = {}; // per-user baseline for tic filtering

function makeEmptyResult() {
	return {
		timestamp: Date.now(),
		manual: { hands: [] },
		nonManual: { faceExpression: {}, headPose: {} },
		mood: 'neutral',
		grammar: { gloss: [], structure: [] },
		noise: { ticsFiltered: false }
	};
}

// Simple tic-aware filter: maintain exponentially-weighted baseline per landmark and suppress rapid recurring deviations
function ticFilter(userKey, hands) {
	if (!self.baselines[userKey]) self.baselines[userKey] = {count:0, avg:[]};
	const b = self.baselines[userKey];
	const alpha = 0.08;
	const threshold = 0.12; // normalized coord threshold; tune per deployment
	let filtered = false;
	hands.forEach((hand, hi) => {
		hand.landmarks = hand.landmarks.map((lm, idx) => {
			const prev = b.avg[idx] || [lm[0], lm[1], lm[2]||0];
			// update baseline
			const updated = [
				prev[0] * (1 - alpha) + lm[0] * alpha,
				prev[1] * (1 - alpha) + lm[1] * alpha,
				(prev[2] || 0) * (1 - alpha) + (lm[2] || 0) * alpha
			];
			b.avg[idx] = updated;
			// if this point deviates from baseline repeatedly, treat as tic and suppress small jitter
			const dx = Math.abs(lm[0] - updated[0]);
			const dy = Math.abs(lm[1] - updated[1]);
			if (dx > threshold || dy > threshold) {
				// mark as filtered by snapping to baseline (lightweight suppression)
				filtered = true;
				return [updated[0], updated[1], updated[2]];
			}
			return lm;
		});
	});
	b.count++;
	return {hands, filtered};
}

async function loadTFJSModel(url) {
	try {
		importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.9.0/dist/tf.min.js');
		// model must be placed at /assets/models/hand_model/model.json
		const model = await tf.loadGraphModel(url);
		return model;
	} catch (err) {
		console.warn('TFJS load failed', err);
		return null;
	}
}

async function tryLoadMediaPipeHands() {
	try {
		// Load MediaPipe Hands (will attach to global)
		importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js');
		// OffscreenCanvas-based runner: create Hands instance and wrap send()
		const Hands = self.Hands || self.window && self.window.Hands;
		if (!Hands) throw new Error('Hands not found');
		const hands = new Hands({locateFile: (file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`});
		// prefer light options for CPU devices in school deployments
		hands.setOptions({maxNumHands:2, modelComplexity:1, minDetectionConfidence:0.6, minTrackingConfidence:0.6});
		// wrap results via callback
		return new Promise((resolve) => {
			hands.onResults((results) => {
				// store latest results on the instance for synchronous retrieval in worker frame handling
				hands._lastResults = results;
			});
			resolve(hands);
		});
	} catch (err) {
		console.warn('MediaPipe Hands load failed', err);
		return null;
	}
}

self.onmessage = async (e) => {
	const msg = e.data;
	if (msg.type === 'loadModels') {
		// prefer mediapipe; fallback to TFJS graph model at /assets/models/hand_model/model.json
		let mp = await tryLoadMediaPipeHands();
		if (mp) {
			self.models = { ready:true, engine:'mediapipe', inst: mp };
			postMessage({type:'modelsLoaded', engine:'mediapipe'});
			return;
		}
		const tfm = await loadTFJSModel('/assets/models/hand_model/model.json');
		if (tfm) {
			self.models = { ready:true, engine:'tfjs', inst: tfm };
			postMessage({type:'modelsLoaded', engine:'tfjs'});
			return;
		}
		postMessage({type:'modelsLoaded', engine:'none', warning:'No inference engine available'});
		return;
	}
	if (msg.type === 'frame' && self.models.ready) {
		// msg.frame is an ImageBitmap (transferred)
		const bitmap = msg.frame;
		const userKey = msg.user || 'default';
		let out = makeEmptyResult();
		try {
			if (self.models.engine === 'mediapipe') {
				// MediaPipe Hands expects an image; feed bitmap directly
				await self.models.inst.send({image: bitmap});
				const r = self.models.inst._lastResults || {};
				if (r.multiHandLandmarks && r.multiHandedness) {
					out.manual.hands = r.multiHandLandmarks.map((landmarks, idx) => {
						const handed = (r.multiHandedness[idx] && r.multiHandedness[idx].label) || 'Unknown';
						// Normalize landmarks to [0,1] using bitmap dimensions if provided
						const w = bitmap.width || 1, h = bitmap.height || 1;
						return {
							side: handed[0] === 'L' ? 'L' : 'R',
							landmarks: landmarks.map(lm => [lm.x, lm.y, lm.z || 0])
						};
					});
				}
				// Optionally extract non-manual features (head pose) from landmarks heuristics (placeholder)
				// e.g., determine head tilt by average hand Y difference -> placeholder
			} else if (self.models.engine === 'tfjs') {
				// TFJS model path: convert ImageBitmap to tensor, run model, and parse outputs
				const tf = self.tf || (self.tf = await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.9.0/dist/tf.min.js'));
				const img = tf.browser.fromPixels(bitmap);
				const resized = tf.image.resizeBilinear(img, [256,256]).div(255.0).expandDims(0);
				const preds = await self.models.inst.executeAsync(resized);
				// Note: parsing depends on model output format; here we attempt to fallback to empty result
				// For production, model must output landmark arrays to parse here.
				img.dispose(); resized.dispose();
			}
			// Apply tic-aware filter (no medical labels): adjust landmarks toward learned baseline
			if (out.manual.hands.length) {
				const res = ticFilter(userKey, out.manual.hands);
				out.manual.hands = res.hands;
				out.noise.ticsFiltered = res.filtered;
			}
			// Lightweight grammar placeholder: convert hand count to a gloss token (for pipeline)
			out.grammar.gloss = out.manual.hands.length ? [`HANDx${out.manual.hands.length}`] : [];
		} catch (err) {
			console.error('Inference error', err);
		} finally {
			// close ImageBitmap if transferrable
			try { bitmap.close && bitmap.close(); } catch(e){}
			postMessage({type:'inference', payload: out});
		}
	}
};
