import mongoose from 'mongoose';
import records from '../src/heritageRecords.js';

const recordSchema=new mongoose.Schema({
  heritageId:{type:String,trim:true,maxlength:20,index:true},
  mergedIds:{type:[String],default:[]},
  slug:{type:String,required:true,unique:true,index:true},
  title:{type:String,required:true,trim:true,maxlength:120},
  aliases:{type:[String],default:[]},
  category:{type:String,required:true,trim:true,maxlength:80},
  district:{type:String,required:true,trim:true,maxlength:80},
  municipality:{type:String,trim:true,maxlength:100},
  summary:{type:String,required:true,trim:true,maxlength:800},
  description:{type:String,trim:true,maxlength:5000},
  architecturalFeatures:{type:String,trim:true,maxlength:1200},
  story:{type:String,trim:true,maxlength:5000},
  language:{type:String,trim:true,maxlength:100},
  source:{type:String,trim:true,maxlength:500},
  sourceUrls:{type:[String],default:[]},
  image:{type:String,trim:true,maxlength:1000,default:null},
  imageSource:{type:String,trim:true,maxlength:500,default:null},
  imageCredit:{type:String,trim:true,maxlength:180,default:null},
  imageLicense:{type:String,trim:true,maxlength:80,default:null},
  modelUrl:{type:String,trim:true,maxlength:1000,default:null},
  modelId:{type:mongoose.Schema.Types.ObjectId,ref:'HeritageModel',default:null},
  contributor:{type:String,trim:true,maxlength:160},
  status:{type:String,required:true,enum:['Pending review','Reviewed','Community reviewed','Location generalized','Illustrative sample','Rejected']},
  visibility:{type:String,required:true,enum:['Public','Restricted']},
  coordinates:{lat:Number,lng:Number},
  year:{type:String,trim:true,maxlength:80},
  consent:{type:Boolean,default:false}
},{timestamps:true,strict:true});

const modelSchema=new mongoose.Schema({
  filename:{type:String,required:true,trim:true,maxlength:180},
  contentType:{type:String,required:true,enum:['model/gltf-binary','application/octet-stream']},
  extension:{type:String,required:true,enum:['glb','skp']},
  fileId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},
  sizeBytes:{type:Number,required:true,min:1},
  heritageSlug:{type:String,trim:true,maxlength:120,default:null},
  bucketName:{type:String,required:true,default:'heritageModels'}
},{timestamps:true,strict:true});
modelSchema.index({createdAt:-1});

const Entry=mongoose.models.HeritageEntry||mongoose.model('HeritageEntry',recordSchema);
const HeritageModel=mongoose.models.HeritageModel||mongoose.model('HeritageModel',modelSchema);
const {GridFSBucket,ObjectId}=mongoose.mongo;

export const sampleEntries=records;

export async function connectDatabase(){
  if(mongoose.connection.readyState===1)return;
  const uri=process.env.MONGODB_URI;
  if(!uri)throw new Error('DATABASE_NOT_CONFIGURED');
  if(!globalThis.heritageMongoPromise)globalThis.heritageMongoPromise=mongoose.connect(uri,{serverSelectionTimeoutMS:8000});
  await globalThis.heritageMongoPromise;
}

async function seedCuratedRecords(){
  if(!globalThis.heritageSeedPromise){
    const curatedFields=['heritageId','mergedIds','title','aliases','category','district','municipality','summary','description','architecturalFeatures','story','source','sourceUrls','image','imageSource','imageCredit','imageLicense','modelUrl'];
    globalThis.heritageSeedPromise=Entry.bulkWrite(records.map(record=>({updateOne:{filter:{slug:record.slug},update:{$setOnInsert:Object.fromEntries(Object.entries(record).filter(([field])=>field==='slug'||!curatedFields.includes(field))),$set:Object.fromEntries(curatedFields.map(field=>[field,record[field]??(['mergedIds','aliases','sourceUrls'].includes(field)?[]:null)]))},upsert:true}})),{ordered:false});
  }
  await globalThis.heritageSeedPromise;
}

export async function publicEntries({includeLoadTest=false}={}){
  if(!process.env.MONGODB_URI)return records.map(publicRecord);
  await connectDatabase();
  await seedCuratedRecords();
  const query={visibility:'Public',status:{$in:['Reviewed','Community reviewed','Location generalized','Illustrative sample']}};
  if(!includeLoadTest)query.slug={$not:/^loadtest-sample-/};
  return (await Entry.find(query).lean()).map(publicRecord);
}

export function publicRecord(record){
  if(!record)return record;
  const {_id,__v,coordinates,modelId,...safe}=record;
  return {...safe,modelId:modelId?String(modelId):null};
}

export function publicModel(model){
  return {id:String(model._id),filename:model.filename,contentType:model.contentType,extension:model.extension,sizeBytes:model.sizeBytes,heritageSlug:model.heritageSlug||null,createdAt:model.createdAt};
}

export function entryModel(){return Entry}
export function heritageModel(){return HeritageModel}
export function gridFsBucket(){
  if(mongoose.connection.readyState!==1)throw new Error('DATABASE_NOT_CONNECTED');
  if(!globalThis.heritageGridFsBucket)globalThis.heritageGridFsBucket=new GridFSBucket(mongoose.connection.db,{bucketName:'heritageModels'});
  return globalThis.heritageGridFsBucket;
}
export function databaseObjectId(value){return ObjectId.isValid(value)?new ObjectId(value):null}
