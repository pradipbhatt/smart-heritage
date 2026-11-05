import { timingSafeEqual } from 'node:crypto';
import { connectDatabase, entryModel } from '../../server/heritage.js';

function authorized(req){
  const expected=process.env.REVIEWER_API_KEY||'',provided=String(req.headers['x-reviewer-key']||'');
  if(!expected||!provided)return false;
  const a=Buffer.from(expected),b=Buffer.from(provided);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return res.status(405).setHeader('Allow','GET, POST').json({error:'Method not allowed'});
  if(!process.env.REVIEWER_API_KEY)return res.status(503).json({error:'Reviewer access is not configured on this deployment.'});
  if(!authorized(req))return res.status(401).json({error:'Reviewer key is not valid.'});
  try{
    await connectDatabase();const Entry=entryModel();
    if(req.method==='GET'){
      const submissions=await Entry.find({status:'Pending review',visibility:'Restricted'}).sort({createdAt:-1}).select('-coordinates -__v').lean();
      return res.status(200).json({submissions});
    }
    const {slug,action}=req.body||{};
    if(typeof slug!=='string'||!['approve','reject'].includes(action))return res.status(400).json({error:'A submission slug and approve/reject action are required.'});
    const record=await Entry.findOne({slug,status:'Pending review',visibility:'Restricted'});
    if(!record)return res.status(404).json({error:'Pending submission not found.'});
    if(action==='approve'&&!record.consent)return res.status(409).json({error:'This submission does not have recorded consent.'});
    record.status=action==='approve'?'Community reviewed':'Rejected';
    record.visibility=action==='approve'?'Public':'Restricted';
    await record.save();
    return res.status(200).json({ok:true,message:action==='approve'?'Submission approved and made public.':'Submission rejected and kept restricted.'});
  }catch(error){
    if(error.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'Reviewer storage is not configured yet.'});
    return res.status(503).json({error:'Review service is temporarily unavailable.'});
  }
}
