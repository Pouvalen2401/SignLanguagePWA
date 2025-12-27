import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';

export class AvatarRenderer {
	constructor(container){
		this.container = container;
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 1000);
		this.renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
		this.renderer.setSize(container.clientWidth, container.clientHeight);
		container.innerHTML=''; container.appendChild(this.renderer.domElement);
		this.camera.position.set(0,1.6,2.5);
		const light = new THREE.HemisphereLight(0xffffff,0x444444,1.0); this.scene.add(light);
		this.mixer = null; this.model = null;
		window.addEventListener('resize', ()=>this.onResize(), false);
		this.clock = new THREE.Clock();
		this._animate = this._animate.bind(this);
		requestAnimationFrame(this._animate);
	}
	onResize(){ const c=this.container; this.camera.aspect=c.clientWidth/c.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(c.clientWidth,c.clientHeight); }
	async loadAvatar(url, config = {}) {
		const loader = new GLTFLoader();
		const gltf = await new Promise((res,rej)=>loader.load(url,res,undefined,rej));
		if (this.model) this.scene.remove(this.model);
		this.model = gltf.scene;
		// apply simple parametric changes from config (scale, color)
		if (config.scale) this.model.scale.setScalar(config.scale);
		this.scene.add(this.model);
		this.mixer = gltf.animations.length ? new THREE.AnimationMixer(this.model) : null;
	}
	_applySignJSON(signJSON){
		// Map structured JSON to avatar transforms:
		// Example: move hand bones using landmarks -> implement using skeleton & IK in production
		// Placeholder: rotate model slightly for headPose
		if (!this.model) return;
		const head = this.model.getObjectByName('Head') || this.model;
		if (signJSON.nonManual && signJSON.nonManual.headPose) {
			const p = signJSON.nonManual.headPose;
			head.rotation.y = (p.yaw||0) * 0.01;
			head.rotation.x = (p.pitch||0) * 0.01;
		}
		// Prioritize grammar over mood: small additive changes for mood
		if (signJSON.mood && signJSON.mood !== 'neutral') {
			const factor = signJSON.mood === 'happy' ? 0.03 : -0.02;
			this.model.rotation.z = factor;
		}
	}
	playSign(signJSON){
		// signJSON can be an array of frames or a single frame
		this._applySignJSON(signJSON);
	}
	_animate(){
		requestAnimationFrame(this._animate);
		const dt = this.clock.getDelta();
		if (this.mixer) this.mixer.update(dt);
		this.renderer.render(this.scene, this.camera);
	}
}
