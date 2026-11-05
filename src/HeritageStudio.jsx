import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box, Database, RefreshCw, Rotate3D, Upload, ZoomIn } from 'lucide-react';
import heritageRecords from './heritageRecords.js';

const componentNames = ['Pagoda roof', 'Upper roof', 'Timber frame', 'Entry', 'Stone plinth'];
const MODEL_DB='heritage-atlas-models';
const openModelDb=()=>new Promise((resolve,reject)=>{const request=indexedDB.open(MODEL_DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('models',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
const localModels=async()=>{const db=await openModelDb();return new Promise((resolve,reject)=>{const request=db.transaction('models').objectStore('models').getAll();request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.createdAt-a.createdAt));request.onerror=()=>reject(request.error)})};
const saveLocalModel=async(file,heritageSlug)=>{const db=await openModelDb();const model={id:crypto.randomUUID(),filename:file.name,contentType:file.type||'application/octet-stream',sizeBytes:file.size,heritageSlug:heritageSlug||null,createdAt:Date.now(),file};return new Promise((resolve,reject)=>{const tx=db.transaction('models','readwrite');tx.objectStore('models').put(model);tx.oncomplete=()=>resolve(model);tx.onerror=()=>reject(tx.error)})};

function makePagoda() {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#9aa397', roughness: .9 });
  const timber = new THREE.MeshStandardMaterial({ color: '#8c5739', roughness: .82 });
  const accent=getComputedStyle(document.documentElement).getPropertyValue('--atlas-accent').trim()||'#82b58d';
  const roof = new THREE.MeshStandardMaterial({ color: accent, roughness: .78 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d0a34e', metalness: .25, roughness: .55 });
  const add = (geometry, material, pos, label, scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...pos); mesh.userData.label = label;
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  add(new THREE.BoxGeometry(3.7,.32,3.7),stone,[0,.16,0],'Stone plinth');
  add(new THREE.BoxGeometry(3.1,.22,3.1),stone,[0,.43,0],'Raised platform');
  add(new THREE.BoxGeometry(2.4,1.9,2.4),timber,[0,1.48,0],'Timber frame');
  add(new THREE.BoxGeometry(.72,1.45,.08),new THREE.MeshStandardMaterial({color:'#593923'}),[0,1.28,1.24],'Entry');
  for (const x of [-1.18,1.18]) for (const z of [-1.18,1.18]) add(new THREE.CylinderGeometry(.07,.09,2.15,8),gold,[x,1.5,z],'Timber column');
  const roof1=add(new THREE.CylinderGeometry(0,2.02,.84,4,1),roof,[0,2.95,0],'Pagoda roof'); roof1.rotation.y=Math.PI/4;
  add(new THREE.BoxGeometry(4.35,.12,4.35),timber,[0,2.56,0],'Carved eaves');
  const roof2=add(new THREE.CylinderGeometry(0,1.24,.65,4,1),roof,[0,3.62,0],'Upper roof'); roof2.rotation.y=Math.PI/4;
  add(new THREE.CylinderGeometry(.035,.085,.8,8),gold,[0,4.38,0],'Finial');
  add(new THREE.SphereGeometry(.12,12,8),gold,[0,4.84,0],'Finial');
  return group;
}

export default function HeritageStudio() {
  const host = useRef(null), modelRef = useRef(null), controlsRef = useRef(null), cameraRef = useRef(null), rendererRef = useRef(null), fileRef = useRef(null), workerRef = useRef(null),sceneRef=useRef(null),gridRef=useRef(null),proceduralRef=useRef(true);
  const [part,setPart]=useState('Pagoda roof'),[modelName,setModelName]=useState('Community pagoda study'),[error,setError]=useState(''),[loading,setLoading]=useState(false),[progress,setProgress]=useState(''),[notice,setNotice]=useState(''),[storedModels,setStoredModels]=useState([]),[heritageEntries,setHeritageEntries]=useState(heritageRecords),[heritageSlug,setHeritageSlug]=useState(''),[libraryReady,setLibraryReady]=useState(false),[storageMode,setStorageMode]=useState(''),[libraryMessage,setLibraryMessage]=useState('Checking model storage…');
  const refreshLibrary=async()=>{
    try{
      const response=await fetch('/api/models');
      const data=response.ok?await response.json():null;
      if(data?.storage==='mongodb'){
        setStoredModels(data.models||[]);setLibraryReady(true);setStorageMode('mongodb');setLibraryMessage(`MongoDB connected · ${(data.models||[]).length} saved models`);
        const entriesResponse=await fetch('/api/entries');if(entriesResponse.ok){const entries=await entriesResponse.json();if(entries.length)setHeritageEntries(entries)}
        return;
      }
      throw new Error('Use browser storage on this deployment.');
    }catch{try{const models=await localModels();setStoredModels(models);setLibraryReady(true);setStorageMode('browser');setLibraryMessage(`Saved in this browser · ${models.length} model${models.length===1?'':'s'} · only available on this device and browser`)}catch{setStoredModels([]);setLibraryReady(false);setStorageMode('');setLibraryMessage('Model storage is unavailable in this browser.')}}
  };
  useEffect(()=>{refreshLibrary()},[]);
  useEffect(()=>{
    const el=host.current; if(!el)return;
    const scene=new THREE.Scene(); scene.background=new THREE.Color('#262a26');sceneRef.current=scene;
    const camera=new THREE.PerspectiveCamera(42,1,.1,100); camera.position.set(7,6,8);cameraRef.current=camera;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)); renderer.shadowMap.enabled=false; el.appendChild(renderer.domElement); rendererRef.current=renderer;
    scene.add(new THREE.HemisphereLight(0xe9f6eb,0x243026,2.15));
    const sun=new THREE.DirectionalLight(0xffffff,2.4); sun.position.set(5,9,6); scene.add(sun);
    const fill=new THREE.DirectionalLight(0xffffff,1.2); fill.position.set(-5,3,-4); scene.add(fill);
    const initialAccent=getComputedStyle(document.documentElement).getPropertyValue('--atlas-accent').trim()||'#82b58d';
    const grid=new THREE.GridHelper(18,36,new THREE.Color(initialAccent),'#434943'); grid.position.y=-.025; scene.add(grid);gridRef.current=grid;
    const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,2,0); controls.enableDamping=true; controls.dampingFactor=.075; controls.minDistance=4; controls.maxDistance=16; controlsRef.current=controls;
    const model=makePagoda(); scene.add(model); modelRef.current=model;
    const resize=()=>{const w=el.clientWidth||600,h=el.clientHeight||420;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};
    let frame=0,changed=false;
    const render=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;changed=false;controls.update();renderer.render(scene,camera);if(controls.autoRotate||changed)render()})};
    const ro=new ResizeObserver(()=>{resize();render()});ro.observe(el);resize();
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
    const click=e=>{const r=renderer.domElement.getBoundingClientRect();pointer.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(modelRef.current?.children||[],true);if(hits.length){let o=hits[0].object;while(o&&!o.userData.label)o=o.parent;if(o?.userData.label)setPart(o.userData.label)}};
    const onControlsChange=()=>{changed=true;render()};
    renderer.domElement.addEventListener('pointerup',click);controls.addEventListener('change',onControlsChange);render();
    return()=>{cancelAnimationFrame(frame);workerRef.current?.terminate();workerRef.current=null;ro.disconnect();renderer.domElement.removeEventListener('pointerup',click);controls.removeEventListener('change',onControlsChange);controls.dispose();renderer.dispose();el.removeChild(renderer.domElement);rendererRef.current=null;cameraRef.current=null;sceneRef.current=null;gridRef.current=null};
  },[]);
  useEffect(()=>{const root=document.documentElement;const updateScene=()=>{const scene=sceneRef.current;if(!scene)return;const light=root.dataset.theme==='light';scene.background=new THREE.Color(light?'#e9ebe5':'#262a26');const previous=gridRef.current;if(previous){scene.remove(previous);previous.geometry.dispose();if(Array.isArray(previous.material))previous.material.forEach(material=>material.dispose());else previous.material.dispose()}const accent=getComputedStyle(root).getPropertyValue('--atlas-accent').trim()||'#82b58d';const grid=new THREE.GridHelper(18,36,new THREE.Color(accent),new THREE.Color(light?'#d6dbd2':'#434943'));grid.position.y=-.025;scene.add(grid);gridRef.current=grid;if(proceduralRef.current)modelRef.current?.traverse(object=>{if(object.isMesh&&['Pagoda roof','Upper roof'].includes(object.userData.label))object.material.color.set(accent)});rendererRef.current?.renderLists.dispose();if(cameraRef.current&&rendererRef.current)rendererRef.current.render(scene,cameraRef.current)};const observer=new MutationObserver(()=>requestAnimationFrame(updateScene));observer.observe(root,{attributes:true,attributeFilter:['data-theme','data-accent','style']});updateScene();return()=>observer.disconnect()},[]);
  const prepareModel=(buffer,extension)=>new Promise((resolve,reject)=>{
    workerRef.current?.terminate();
    const worker=new Worker(new URL('./modelOptimizer.worker.js',import.meta.url),{type:'module'});workerRef.current=worker;
    worker.onmessage=({data})=>{
      if(data.type==='progress'){setProgress(data.message);return}
      worker.terminate();if(workerRef.current===worker)workerRef.current=null;
      if(data.type==='error')reject(new Error(data.message));else resolve(data);
    };
    worker.onerror=event=>{worker.terminate();if(workerRef.current===worker)workerRef.current=null;reject(new Error(event.message||'The background model optimizer stopped unexpectedly.'))};
    worker.postMessage({buffer,extension},[buffer]);
  });
  const loadModel=async(file,{save=true}={})=>{
    if(!file)return;setError('');setNotice('');setProgress('Starting model preparation…');setLoading(true);
    try {
      const ext=file.name.toLowerCase().split('.').pop();
      if(!['glb','skp'].includes(ext))throw new Error('Choose a native SketchUp .skp or binary glTF .glb file.');
      if(file.size>150*1024*1024)throw new Error('This model is larger than 150 MB for an in-browser preview. Export a lighter model from SketchUp.');
      const storagePromise=save&&libraryReady?(storageMode==='mongodb'?(async()=>{const response=await fetch('/api/models',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Model-Name':encodeURIComponent(file.name),'X-Heritage-Slug':heritageSlug},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save model to MongoDB.');return data.model})():saveLocalModel(file,heritageSlug)).catch(cause=>({error:cause.message||'Could not save this model.'})):Promise.resolve(null);
      const [prepared,stored]=await Promise.all([prepareModel(await file.arrayBuffer(),ext),storagePromise]);
      if(save&&!libraryReady)setLibraryMessage('Preview only: model storage is unavailable.');
      if(stored?.error)setLibraryMessage(`Preview loaded, but it was not saved: ${stored.error}`);
      else if(stored){setStoredModels(list=>[stored,...list.filter(model=>model.id!==stored.id)].slice(0,100));setLibraryMessage(storageMode==='mongodb'?`Saved to local MongoDB · ${stored.filename}`:`Saved in this browser · ${stored.filename}`)}
      const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(prepared.buffer,'',resolve,reject));
      const parent=modelRef.current?.parent;
      if(!parent)throw new Error('The 3D preview is still starting. Please try again.');
      const next=gltf.scene;next.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(next);const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());const maxDimension=Math.max(size.x,size.y,size.z,0.001);const scale=4.5/maxDimension;next.scale.setScalar(scale);next.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);next.updateMatrixWorld(true);next.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.userData.label=o.name||'Imported component'}});disposeModel(modelRef.current);parent.remove(modelRef.current);parent.add(next);modelRef.current=next;proceduralRef.current=false;setModelName(file.name);setPart('Imported model');setNotice(prepared.optimized?`Optimized ${prepared.stats.before.primitives.toLocaleString()} render parts into ${prepared.stats.after.primitives.toLocaleString()} for smoother preview.`:'Model prepared for interactive preview.');rendererRef.current?.renderLists.dispose();
      const camera=cameraRef.current,controls=controlsRef.current;if(camera&&controls){const fittedBox=new THREE.Box3().setFromObject(next);const fittedSize=fittedBox.getSize(new THREE.Vector3());const fittedCenter=fittedBox.getCenter(new THREE.Vector3());const radius=Math.max(fittedSize.x,fittedSize.y,fittedSize.z)/2;const distance=Math.max(radius/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.45,1);const direction=camera.position.clone().sub(controls.target).normalize();controls.target.copy(fittedCenter);camera.position.copy(fittedCenter).addScaledVector(direction,distance);camera.near=Math.max(distance/1000,.01);camera.far=distance*20;camera.updateProjectionMatrix();controls.minDistance=distance*.12;controls.maxDistance=distance*8;controls.update()}
    } catch (cause) {
      const detail=cause instanceof Error?cause.message:'Unknown file error.';
      setError(file.name.toLowerCase().endsWith('.skp')?`Could not read this SketchUp file. ${detail} Try saving it as a newer .skp version or export a .glb from SketchUp.`:`That .glb could not be opened. ${detail}`);
    } finally {setLoading(false);setProgress('');if(fileRef.current)fileRef.current.value='';}
  };
  const loadSavedModel=async model=>{
    setLibraryMessage(`Loading ${model.filename}…`);
    try{let blob;if(storageMode==='mongodb'){const response=await fetch(`/api/models/${encodeURIComponent(model.id)}/file`);if(!response.ok)throw new Error('Could not retrieve this model from MongoDB.');blob=await response.blob()}else blob=model.file;await loadModel(new File([blob],model.filename,{type:model.contentType}),{save:false});setLibraryMessage(`Loaded ${model.filename} from ${storageMode==='mongodb'?'local MongoDB':'this browser'}.`)}
    catch(cause){setLibraryMessage(cause instanceof Error?cause.message:'Could not load the saved model.')}
  };
  const resetModel=()=>{const parent=modelRef.current?.parent;if(!parent)return;disposeModel(modelRef.current);parent.remove(modelRef.current);proceduralRef.current=true;const next=makePagoda();parent.add(next);modelRef.current=next;setModelName('Community pagoda study');setPart('Pagoda roof');setError('');setNotice('');rendererRef.current?.renderLists.dispose()};
  const rotate=()=>{const c=controlsRef.current;if(c){c.autoRotate=!c.autoRotate;c.dispatchEvent({type:'change'})}};
  return <section className="studio-section" id="studio"><div className="studio-heading"><div><div className="eyebrow dark">INTERACTIVE HERITAGE <span>—</span> 03</div><h2>Explore the <em>structure.</em></h2><p>Rotate, zoom, and select architectural elements in a procedural pagoda study.</p></div><div className="studio-tag"><Box size={16}/> 3D STUDIO</div></div><div className="studio-layout"><div className="studio-view"><div className="studio-canvas" ref={host}/><div className="studio-toolbar"><button onClick={rotate}><Rotate3D size={16}/> Auto rotate</button><button onClick={()=>{controlsRef.current?.dollyIn(1.2);controlsRef.current?.update()}}><ZoomIn size={16}/> Zoom</button><button onClick={resetModel}>Reset model</button><button onClick={()=>fileRef.current?.click()} disabled={loading}><Upload size={16}/> {loading?'Preparing…':'Import .skp / .glb'}</button><input ref={fileRef} type="file" accept=".skp,.glb,application/octet-stream,model/gltf-binary" hidden onChange={e=>loadModel(e.target.files?.[0])}/></div>{loading&&<div className="studio-loading" role="status">{progress}</div>}{error&&<div className="studio-error">{error}</div>}{notice&&!error&&<div className="studio-success">{notice}</div>}<div className="studio-model-library"><div className="library-heading"><div><Database size={15}/><b>Saved model library</b></div><button onClick={refreshLibrary} aria-label="Refresh saved models"><RefreshCw size={14}/> Refresh</button></div><p>{libraryMessage}</p>{libraryReady&&<><label>Link next upload to a heritage record<select value={heritageSlug} onChange={e=>setHeritageSlug(e.target.value)}><option value="">No record link</option>{heritageEntries.map(entry=><option value={entry.slug} key={entry.slug}>{entry.heritageId?`${entry.heritageId} · `:''}{entry.title}</option>)}</select></label><div className="saved-model-list">{storedModels.length?storedModels.map(model=><button key={model.id} disabled={loading} onClick={()=>loadSavedModel(model)}><span>{model.filename}</span><small>{(model.sizeBytes/1024/1024).toFixed(1)} MB{model.heritageSlug?` · ${heritageEntries.find(entry=>entry.slug===model.heritageSlug)?.title||model.heritageSlug}`:''}</small></button>):<small>No models saved yet. Import a .glb or .skp model to add one.</small>}</div></>}<div className="studio-records"><div className="records-title">Heritage records loaded <b>{heritageEntries.length}</b></div><div className="records-list">{heritageEntries.map(entry=><div key={entry.heritageId||entry.slug}><b>{entry.heritageId} · {entry.title}</b><small>{entry.district} · {entry.category}</small></div>)}</div><small>Reviewed, source-linked records bundled with the site. Media files and 3D models are added separately.</small></div></div></div><aside className="studio-info"><span className="studio-kicker">MODEL · {modelName.toUpperCase()}</span><h3>{part}</h3><p>{part==='Imported model'?'The original file is stored persistently in the model library; the optimized preview runs in this browser.':`${part} is one of the visible elements in this illustrative architectural study. Geometry and materials are procedural, not a measured heritage survey.`}</p><div className="component-list">{componentNames.map((name,i)=><button className={part===name?'active':''} key={name} onClick={()=>setPart(name)}><span>0{i+1}</span>{name}</button>)}</div><small>Drag to orbit · scroll to zoom · select a component · import .skp or .glb</small></aside></div></section>
}

function disposeModel(root){
  if(!root)return;
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material)continue;materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  geometries.forEach(geometry=>geometry.dispose());textures.forEach(texture=>texture.dispose());materials.forEach(material=>material.dispose());
}
