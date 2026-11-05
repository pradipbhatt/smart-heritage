import { connectDatabase, entryModel } from '../server/heritage.js';
import { randomUUID } from 'node:crypto';

const clean=value=>typeof value==='string'?value.trim():'';
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).setHeader('Allow','POST').json({error:'Method not allowed'});
  const body=req.body||{};
  const title=clean(body.title),summary=clean(body.summary),contributor=clean(body.contributor);
  if(!title||!summary||!contributor||body.consent!==true)return res.status(400).json({error:'Title, description, attribution, and consent are required.'});
  if(title.length>120||summary.length>800||contributor.length>160)return res.status(400).json({error:'One or more fields exceed the allowed length.'});
  try{
    await connectDatabase();
    const Entry=entryModel();
    const record=await Entry.create({slug:`submission-${randomUUID()}`,title,category:'Community contribution',district:clean(body.district)||'Not specified',municipality:clean(body.municipality),summary,description:summary,story:clean(body.story),language:clean(body.language),source:'Community contribution · pending source review',contributor,status:'Pending review',visibility:'Restricted',consent:true});
    return res.status(201).json({ok:true,message:'Your contribution is saved privately for community review.',slug:record.slug});
  }catch(error){
    if(error.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'Submission storage is not configured yet. Please try again later.'});
    return res.status(503).json({error:'Could not save the contribution. Please try again later.'});
  }
}
