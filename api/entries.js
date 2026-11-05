import { publicEntries } from '../server/heritage.js';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('Allow','GET').json({error:'Method not allowed'});
  try{
    const term=String(req.query?.search||'').trim().toLowerCase();
    const category=String(req.query?.category||'All');
    let entries=await publicEntries();
    if(category!=='All')entries=entries.filter(e=>e.category===category);
    if(term)entries=entries.filter(e=>`${e.title} ${e.summary} ${e.district} ${e.category} ${e.description||''}`.toLowerCase().includes(term));
    return res.status(200).json(entries);
  }catch(error){
    if(error.message==='DATABASE_NOT_CONFIGURED')return res.status(200).json(await publicEntries());
    return res.status(503).json({error:'Heritage records are temporarily unavailable.'});
  }
}
