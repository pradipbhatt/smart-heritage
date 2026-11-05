import mongoose from 'mongoose';
import { connectDatabase } from '../server/heritage.js';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('Allow','GET').json({error:'Method not allowed'});
  if(!process.env.MONGODB_URI)return res.status(200).json({ok:true,storage:'demo-read-only'});
  try{await connectDatabase();return res.status(200).json({ok:true,storage:mongoose.connection.readyState===1?'mongodb':'connecting'})}
  catch{return res.status(503).json({ok:false,storage:'database-unavailable'})}
}
