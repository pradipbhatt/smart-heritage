import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { connectDatabase, databaseObjectId, entryModel, gridFsBucket, heritageModel, publicEntries, publicModel, sampleEntries } from './heritage.js';

const app=express();
const port=Number(process.env.PORT||4000);
const MAX_MODEL_BYTES=150*1024*1024;
const allowedOrigins=new Set(['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5174','http://localhost:5174','http://127.0.0.1:5181','http://localhost:5181','http://127.0.0.1:5182','http://localhost:5182']);
app.use(cors({origin(origin,callback){if(!origin||allowedOrigins.has(origin))return callback(null,true);return callback(new Error('Origin not allowed.'))},allowedHeaders:['Content-Type','X-Model-Name','X-Heritage-Slug','X-Reviewer-Key'],methods:['GET','POST']}));
app.use(express.json({limit:'12mb'}));

const Entry=entryModel();
const Model=heritageModel();
let memory=sampleEntries.map(entry=>({...entry}));
const clean=value=>typeof value==='string'?value.trim():'';

app.get('/api/health',async(_req,res)=>{
  try{await connectDatabase();return res.json({ok:true,storage:mongoose.connection.readyState===1?'mongodb':'connecting',database:mongoose.connection.name})}
  catch(error){if(error.message==='DATABASE_NOT_CONFIGURED')return res.json({ok:true,storage:'demo-read-only'});return res.status(503).json({ok:false,storage:'database-unavailable'})}
});

app.get('/api/entries',async(req,res)=>{
  try{
    const term=clean(req.query.search).toLowerCase(),category=clean(req.query.category)||'All';
    let entries=await publicEntries({includeLoadTest:req.query.loadTest==='1'});
    if(category!=='All')entries=entries.filter(entry=>entry.category===category);
    if(term)entries=entries.filter(entry=>`${entry.title} ${entry.summary} ${entry.district} ${entry.category} ${entry.description||''} ${(entry.aliases||[]).join(' ')}`.toLowerCase().includes(term));
    return res.json(entries);
  }catch{return res.status(503).json({error:'Heritage records are temporarily unavailable.'})}
});

app.get('/api/entries/:slug',async(req,res)=>{
  try{const entries=await publicEntries();const entry=entries.find(item=>item.slug===req.params.slug);return entry?res.json(entry):res.status(404).json({error:'Record not found.'})}
  catch{return res.status(503).json({error:'Heritage record is temporarily unavailable.'})}
});

app.post('/api/submissions',async(req,res)=>{
  const body=req.body||{},title=clean(body.title),summary=clean(body.summary),contributor=clean(body.contributor);
  if(!title||!summary||!contributor||body.consent!==true)return res.status(400).json({error:'Title, description, attribution, and consent are required.'});
  if(title.length>120||summary.length>800||contributor.length>160)return res.status(400).json({error:'One or more fields exceed the allowed length.'});
  const entry={slug:`submission-${randomUUID()}`,title,category:'Community contribution',district:clean(body.district)||'Not specified',municipality:clean(body.municipality),summary,description:summary,story:clean(body.story),language:clean(body.language),source:'Community contribution · pending source review',contributor,status:'Pending review',visibility:'Restricted',coordinates:null,consent:true};
  try{await connectDatabase();await Entry.create(entry);return res.status(201).json({ok:true,message:'Your contribution is saved privately for community review.',slug:entry.slug})}
  catch(error){if(error.message==='DATABASE_NOT_CONFIGURED'){memory.unshift(entry);return res.status(201).json({ok:true,message:'Saved in temporary demo memory; configure local MongoDB to persist it.'})}return res.status(503).json({error:'Could not save the contribution. Please try again later.'})}
});

function reviewerAuthorized(req){
  const expected=process.env.REVIEWER_API_KEY||'',provided=String(req.headers['x-reviewer-key']||'');
  if(!expected||!provided)return false;
  const a=Buffer.from(expected),b=Buffer.from(provided);
  return a.length===b.length&&timingSafeEqual(a,b);
}

app.get('/api/review/submissions',async(req,res)=>{
  if(!process.env.REVIEWER_API_KEY)return res.status(503).json({error:'Reviewer access is not configured on this server.'});
  if(!reviewerAuthorized(req))return res.status(401).json({error:'Reviewer key is not valid.'});
  try{await connectDatabase();const submissions=await Entry.find({status:'Pending review',visibility:'Restricted'}).sort({createdAt:-1}).select('-coordinates -__v').lean();return res.json({submissions})}
  catch{return res.status(503).json({error:'Review service is temporarily unavailable.'})}
});

app.post('/api/review/submissions',async(req,res)=>{
  if(!process.env.REVIEWER_API_KEY)return res.status(503).json({error:'Reviewer access is not configured on this server.'});
  if(!reviewerAuthorized(req))return res.status(401).json({error:'Reviewer key is not valid.'});
  const {slug,action}=req.body||{};
  if(typeof slug!=='string'||!['approve','reject'].includes(action))return res.status(400).json({error:'A submission slug and approve/reject action are required.'});
  try{
    await connectDatabase();
    const record=await Entry.findOne({slug,status:'Pending review',visibility:'Restricted'});
    if(!record)return res.status(404).json({error:'Pending submission not found.'});
    if(action==='approve'&&!record.consent)return res.status(409).json({error:'This submission does not have recorded consent.'});
    record.status=action==='approve'?'Community reviewed':'Rejected';record.visibility=action==='approve'?'Public':'Restricted';await record.save();
    return res.json({ok:true,message:action==='approve'?'Submission approved and made public.':'Submission rejected and kept restricted.'});
  }catch{return res.status(503).json({error:'Review service is temporarily unavailable.'})}
});

app.get('/api/models',async(_req,res)=>{
  try{
    await connectDatabase();
    const models=await Model.find({}).sort({createdAt:-1}).limit(100).lean();
    return res.json({storage:'mongodb',models:models.map(publicModel)});
  }catch(error){
    if(error.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({storage:'unavailable',error:'Local MongoDB is not configured.'});
    return res.status(503).json({storage:'unavailable',error:'Could not load the local model library.'});
  }
});

app.post('/api/models',async(req,res)=>{
  let bucket,fileId,savedMetadata;
  try{
    await connectDatabase();
    const rawName=decodeURIComponent(String(req.headers['x-model-name']||''));
    const filename=rawName.replace(/[\\/\0]/g,'-').trim();
    const extension=filename.toLowerCase().split('.').pop();
    if(!filename||filename.length>180||!['glb','skp'].includes(extension))return res.status(400).json({error:'Upload a .glb or .skp model with a valid file name.'});
    if(req.headers['content-type']!=='application/octet-stream')return res.status(415).json({error:'Model uploads must use application/octet-stream.'});
    const expectedLength=Number(req.headers['content-length']||0);
    if(expectedLength>MAX_MODEL_BYTES)return res.status(413).json({error:'Models must be 150 MB or smaller.'});
    const heritageSlug=clean(req.headers['x-heritage-slug']);
    if(heritageSlug&&!await Entry.exists({slug:heritageSlug,visibility:'Public'}))return res.status(400).json({error:'Choose a public heritage record before linking this model.'});

    bucket=gridFsBucket();
    const contentType=extension==='glb'?'model/gltf-binary':'application/octet-stream';
    const upload=bucket.openUploadStream(filename,{contentType,metadata:{extension,heritageSlug:heritageSlug||null}});
    fileId=upload.id;
    let sizeBytes=0;
    const sizeGuard=new Transform({transform(chunk,_encoding,callback){sizeBytes+=chunk.length;if(sizeBytes>MAX_MODEL_BYTES)return callback(new Error('Model exceeds the 150 MB upload limit.'));callback(null,chunk)}});
    await pipeline(req,sizeGuard,upload);
    if(sizeBytes===0)throw new Error('The uploaded model is empty.');
    savedMetadata=await Model.create({filename,contentType,extension,fileId,sizeBytes,heritageSlug:heritageSlug||null});
    if(heritageSlug)await Entry.updateOne({slug:heritageSlug},{$set:{modelId:savedMetadata._id}});
    return res.status(201).json({model:publicModel(savedMetadata.toObject())});
  }catch(error){
    if(savedMetadata){await Entry.updateOne({modelId:savedMetadata._id},{$set:{modelId:null}}).catch(()=>{});await Model.deleteOne({_id:savedMetadata._id}).catch(()=>{})}
    if(bucket&&fileId)await bucket.delete(fileId).catch(()=>{});
    if(error.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'The local model library requires a running MongoDB server.'});
    if(error.message?.includes('150 MB'))return res.status(413).json({error:'Models must be 150 MB or smaller.'});
    if(!res.headersSent)return res.status(503).json({error:'Could not store this model in local MongoDB.'});
    res.destroy(error);
  }
});

app.get('/api/models/:id/file',async(req,res)=>{
  try{
    await connectDatabase();
    const id=databaseObjectId(req.params.id);if(!id)return res.status(400).json({error:'Invalid model id.'});
    const model=await Model.findById(id).lean();if(!model)return res.status(404).json({error:'Stored model not found.'});
    res.setHeader('Content-Type',model.contentType);
    res.setHeader('Content-Length',model.sizeBytes);
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(model.filename)}`);
    res.setHeader('Cache-Control','private, no-store');
    await pipeline(gridFsBucket().openDownloadStream(model.fileId),res);
  }catch(error){if(!res.headersSent)return res.status(503).json({error:'Could not load the stored model.'});res.destroy(error)}
});

const here=path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.resolve(here,'../dist')));
app.get('*',(_req,res)=>res.sendFile(path.resolve(here,'../dist/index.html')));
app.listen(port,'127.0.0.1',()=>console.log(`Heritage Atlas API on http://127.0.0.1:${port}`));
