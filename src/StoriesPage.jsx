import { ArrowUpRight, AudioLines, BookOpen, ShieldCheck } from 'lucide-react';
import HeritageImage from './HeritageImage.jsx';
import ImageCredit from './ImageCredit.jsx';

export default function StoriesPage({entries=[]}){
  return <section className="standalone-stories">
    <div className="eyebrow dark">COMMUNITY STORIES <span>—</span> 02</div><h1>Stories that carry <em>place.</em></h1>
    <p>Explore source-linked heritage records. Community knowledge is labeled and published only with consent.</p>
    <div className="story-grid">{entries.map(entry=><article className="story-card" key={entry.slug}>
      <HeritageImage entry={entry}/><ImageCredit entry={entry}/>
      <div className="story-card-copy"><span className="record-cat"><AudioLines size={13}/>{entry.category} · {entry.district}</span><h2>{entry.title}</h2><p>{entry.story||entry.summary}</p>
        <div className="story-meta"><span><BookOpen size={14}/>{entry.source}</span><span><ShieldCheck size={14}/>{entry.status}</span></div>
        <a href={`/explorer?record=${encodeURIComponent(entry.slug)}`}>Read this record <ArrowUpRight size={14}/></a>
      </div>
    </article>)}</div>
  </section>;
}
