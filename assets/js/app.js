import {DB} from './idb.js';
import {AvatarRenderer} from './avatarRenderer.js';

const video = document.getElementById('camera');
const overlay = document.getElementById('overlay');
const startCam = document.getElementById('startCam');
const startDetect = document.getElementById('startDetect');
const stopDetect = document.getElementById('stopDetect');
const liveText = document.getElementById('liveText');
const playSign = document.getElementById('playSign');
const avatarContainer = document.getElementById('avatarContainer');
const userNameEl = document.getElementById('userName');
const signInBtn = document.getElementById('signInBtn');
const guestBtn = document.getElementById('guestBtn');
const consentBiometrics = document.getElementById('consentBiometrics');
const resetProfile = document.getElementById('resetProfile');

let stream = null;
let worker = new Worker('/assets/js/worker.infer.js');
worker.postMessage({type:'loadModels'}); // worker will try MediaPipe then TFJS
worker.onmessage = (e)=>{
	if (e.data.type === 'modelsLoaded') {
		console.log('Models loaded in worker:', e.data.engine);
	}
	if (e.data.type === 'inference') handleInference(e.data.payload);
};

const avatar = new AvatarRenderer(avatarContainer);
avatar.loadAvatar('/assets/models/default_avatar.gltf', {scale:1.0}).catch(()=>{});

async function startCamera(){
	stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false});
	video.srcObject = stream;
	await video.play();
	overlay.width = video.videoWidth; overlay.height = video.videoHeight;
}
startCam.addEventListener('click', ()=>startCamera());

let running = false;
startDetect.addEventListener('click', ()=>{
	if (!stream) startCamera().then(()=>startPipeline());
	else startPipeline();
});
stopDetect.addEventListener('click', ()=>running=false);

function startPipeline(){
	if (running) return;
	running = true;
	async function loop(){
		if (!running) return;
		if (video.readyState >= 2) {
			const bitmap = await createImageBitmap(video, {imageOrientation:'none'});
			// include user identity for tic-baseline; use Guest when not signed in
			const userKey = (userNameEl.textContent && userNameEl.textContent !== 'Guest') ? userNameEl.textContent : 'Guest';
			// transfer bitmap for low-latency
			worker.postMessage({type:'frame', frame: bitmap, user: userKey}, [bitmap]);
		}
		// Aim for low-latency: minimal work on main thread
		setTimeout(loop, 30); // ~33fps
	}
	loop();
}

function handleInference(data){
	// Data is structured JSON that separates grammar, mood, noise
	// Prioritize grammar over mood when rendering/displaying:
	const text = data.grammar && data.grammar.gloss && data.grammar.gloss.join(' ') || '';
	liveText.textContent = text || `[${data.mood || 'neutral'}]`;
	// Avatar consumes only structured data
	avatar.playSign(data);
}

// Profile & consent
signInBtn.addEventListener('click', async ()=>{
	const username = prompt('Enter username (id for shared device):');
	if (!username) return;
	userNameEl.textContent = username;
	// Load or create profile on server
	const res = await fetch('/api.php?action=get&username=' + encodeURIComponent(username)).then(r=>r.json());
	if (res.error) {
		await fetch('/api.php?action=create', {method:'POST',body:JSON.stringify({username,displayName:username}),headers:{'Content-Type':'application/json'}});
	}
	const profile = await fetch('/api.php?action=get&username=' + encodeURIComponent(username)).then(r=>r.json()).catch(()=>null);
	if (profile && profile.avatarConfig) avatar.loadAvatar('/assets/models/default_avatar.gltf', profile.avatarConfig).catch(()=>{});
});

guestBtn.addEventListener('click', ()=>{ userNameEl.textContent='Guest'; });

resetProfile.addEventListener('click', async ()=>{
	if (!confirm('Reset profile and local data? This deletes local templates.')) return;
	const username = userNameEl.textContent;
	if (username && username !== 'Guest') await fetch('/api.php?action=reset', {method:'POST', body:JSON.stringify({username}), headers:{'Content-Type':'application/json'}});
	await DB.delete('faceTemplates', username);
	alert('Profile reset. Client-side templates removed.');
});

// Text → Sign play
playSign.addEventListener('click', ()=> {
	const text = document.getElementById('textToSign').value;
	// Convert text to structured sign JSON (client TTS->sign pipeline). Minimal rule-based placeholder:
	const signJSON = {
		grammar: { gloss: text.split(/\s+/) },
		manual: { hands: [] },
		nonManual: { faceExpression: {}, headPose: {} },
		mood: 'neutral'
	};
	avatar.playSign(signJSON);
});

// Consent sync toggle
consentBiometrics.addEventListener('change', async (e)=>{
	const ok = e.target.checked;
	const username = userNameEl.textContent;
	if (username && username !== 'Guest') {
		await fetch('/api.php?action=update', {method:'POST', body:JSON.stringify({username, optIn: ok, displayName: username}), headers:{'Content-Type':'application/json'}});
		alert('Consent updated on server.');
	} else {
		alert('Sign in to persist consent across devices.');
	}
});
