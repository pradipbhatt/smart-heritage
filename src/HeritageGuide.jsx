import { useState } from 'react';
import { ArrowRight, BookOpen, MessageCircle, Send, ShieldCheck, Sparkles } from 'lucide-react';

const prompts=['What can you tell me about Deuda?','Which record is from Bajhang?','How are sensitive locations handled?'];

function answerFromRecords(question,entries){
  const q=question.toLowerCase();
  const tokens=q.split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>2);
  const scored=entries.map(entry=>{const corpus=`${entry.title} ${entry.category} ${entry.district} ${entry.municipality} ${entry.summary} ${entry.description} ${entry.story} ${entry.source}`.toLowerCase();return{entry,score:tokens.reduce((n,t)=>n+(corpus.includes(t)?1:0),0)}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(/sensitive|location|privacy|protect|exact place/.test(q))return{text:'The sample records describe locations only at an appropriate public level. The guide does not provide private coordinates or restricted knowledge.',sources:entries.filter(e=>/generalized|generalized|location/i.test(`${e.status} ${e.source}`)).slice(0,2)};
  if(!scored.length)return{text:'I can only answer from the sample Atlas records shown here. Try a record title, district, tradition, or source term; I won’t fill gaps with guesses.',sources:[]};
  const e=scored[0].entry;let text=e.summary;
  if(/source|who|evidence|recorded/.test(q))text=`The record lists this source: ${e.source}. Its review status is ${e.status}. ${e.description}`;
  else if(/where|district|location/.test(q))text=`${e.title} is listed in ${e.district}${e.municipality?`, around ${e.municipality}`:''}. ${e.summary}`;
  else if(/story|remember|tradition|practice|what/.test(q))text=e.description||e.summary;
  return{text,sources:[e]};
}

export default function HeritageGuide({entries=[]}){
  const [messages,setMessages]=useState([{role:'assistant',text:'Ask about a place, tradition, district, or source. I’ll answer from the Atlas sample records and show the record I used.',sources:[]}]);
  const [draft,setDraft]=useState('');
  const send=value=>{const q=value.trim();if(!q)return;const result=answerFromRecords(q,entries);setMessages(m=>[...m,{role:'user',text:q},{role:'assistant',...result}]);setDraft('')};
  return <section className="guide-section" id="guide"><div className="studio-heading"><div><div className="eyebrow dark">SOURCE-AWARE ASSISTANT <span>—</span> 04</div><h2>Ask the <em>heritage guide.</em></h2><p>Answers cite the sample records used. Unknown details stay unanswered.</p></div><div className="studio-tag"><Sparkles size={16}/> ATLAS GUIDE</div></div><div className="guide-shell"><div className="guide-top"><span><MessageCircle size={16}/> COMMUNITY HERITAGE GUIDE</span><span className="guide-status"><i/> GROUNDED DEMO</span></div><div className="guide-messages">{messages.map((m,i)=><div className={`guide-message ${m.role}`} key={i}><div className="guide-avatar">{m.role==='assistant'?<Sparkles size={15}/>:<span>YOU</span>}</div><div className="guide-bubble"><p>{m.text}</p>{m.sources?.length>0&&<div className="guide-sources">{m.sources.map(s=><span key={s.slug}><BookOpen size={13}/><b>{s.title}</b><small>{s.source}</small></span>)}</div>}</div></div>)}</div><div className="guide-prompts">{prompts.map(p=><button key={p} onClick={()=>send(p)}>{p}<ArrowRight size={13}/></button>)}</div><form className="guide-input" onSubmit={e=>{e.preventDefault();send(draft)}}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Ask about a place, tradition, or source…" aria-label="Ask the heritage guide"/><button aria-label="Send question" type="submit"><Send size={16}/></button></form><div className="guide-note"><ShieldCheck size={14}/> Demonstration uses source matching over sample records, not an LLM. Some sample descriptions are illustrative and need community verification.</div></div></section>
}
