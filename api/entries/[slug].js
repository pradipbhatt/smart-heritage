import { publicEntries } from '../../server/heritage.js';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('Allow','GET').json({error:'Method not allowed'});
  try{
    const entries=await publicEntries();
    const entry=entries.find(item=>item.slug===req.query.slug);
    return entry?res.status(200).json(entry):res.status(404).json({error:'Record not found'});
  }catch{return res.status(503).json({error:'Heritage record is temporarily unavailable.'})}
}
