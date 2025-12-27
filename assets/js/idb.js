export const DB = {
	async open(){
		if (this.db) return this.db;
		return new Promise((res, rej)=>{
			const req = indexedDB.open('SignPWA',1);
			req.onupgradeneeded = e=>{
				const db = e.target.result;
				db.createObjectStore('profiles',{keyPath:'username'});
				db.createObjectStore('models');
				db.createObjectStore('faceTemplates');
			};
			req.onsuccess = ()=>{ this.db = req.result; res(this.db); };
			req.onerror = ()=> rej(req.error);
		});
	},
	async put(store, key, value){
		const db = await this.open();
		return new Promise((res, rej)=>{
			const tx = db.transaction(store,'readwrite');
			tx.objectStore(store).put(Object.assign({id:key}, value));
			tx.oncomplete = ()=>res(true);
			tx.onerror = ()=>rej(tx.error);
		});
	},
	async get(store, key){
		const db = await this.open();
		return new Promise((res, rej)=>{
			const tx = db.transaction(store,'readonly');
			const r = tx.objectStore(store).get(key);
			r.onsuccess = ()=>res(r.result);
			r.onerror = ()=>rej(r.error);
		});
	},
	async delete(store,key){
		const db = await this.open();
		return new Promise((res, rej)=>{
			const tx = db.transaction(store,'readwrite');
			tx.objectStore(store).delete(key);
			tx.oncomplete = ()=>res(true);
			tx.onerror = ()=>rej(tx.error);
		});
	}
};
