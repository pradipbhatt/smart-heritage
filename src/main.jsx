import React,{useEffect,useMemo,useRef,useState} from 'react';import{createRoot}from'react-dom/client';import{ArrowDown,ArrowLeft,ArrowRight,ArrowUpRight,AudioLines,BookOpen,Check,ChevronDown,Compass,Filter,Globe2,Heart,Info,MapPin,Menu,Mic2,Plus,RotateCcw,Search,ShieldCheck,SlidersHorizontal,Sparkles,X}from'lucide-react';import'./style.css';import heritageRecords from './heritageRecords.js';import HeritageImage from './HeritageImage.jsx';const HeritageMap=React.lazy(()=>import('./HeritageMap.jsx'));import ImageCredit from './ImageCredit.jsx';import HeritageStudio from './HeritageStudio.jsx';import HeritageGuide from './HeritageGuide.jsx';import ReviewerPanel from './ReviewerPanel.jsx';import PageShell from './PageShell.jsx';import ExplorerPage from './ExplorerPage.jsx';import StoriesPage from './StoriesPage.jsx';import ThemeControls from './ThemeControls.jsx';

const fallback=heritageRecords;
const DISTRICTS=['Dadeldhura','Baitadi','Darchula','Bajhang','Bajura','Doti','Achham','Kailali','Kanchanpur'];
const normalizeDistrict=value=>String(value||'').toLowerCase().replace(/\s*\(regional\)/,'').replace(/[^a-z]/g,'');

function App(){
  const[entries,setEntries]=useState(fallback),[selected,setSelected]=useState(null),[search,setSearch]=useState(''),[category,setCategory]=useState('All'),[districtFilter,setDistrictFilter]=useState('All'),[modal,setModal]=useState(new URLSearchParams(window.location.search).get('contribute')==='1'),[notice,setNotice]=useState(''),[lang,setLang]=useState('EN'),[menu,setMenu]=useState(false),[busy,setBusy]=useState(false),[formError,setFormError]=useState('');
  const searchInputRef=useRef(null),recordListRef=useRef(null);

  useEffect(()=>{fetch('/api/entries').then(r=>r.ok?r.json():fallback).then(x=>{if(x?.length)setEntries(x)}).catch(()=>{})},[]);

  useEffect(()=>{
    const onKeyDown=e=>{
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){
        if(searchInputRef.current){
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.scrollIntoView({behavior:'smooth',block:'center'});
        }
      }
    };
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[]);

  const cats=useMemo(()=>['All',...new Set(entries.map(entry=>entry.category).filter(Boolean))],[entries]);
  const filtered=useMemo(()=>{
    const distKey=normalizeDistrict(districtFilter);
    return entries.filter(e=>{
      const matchesCat=category==='All'||e.category===category;
      const entryDistKey=normalizeDistrict(e.district);
      const matchesDist=districtFilter==='All'||entryDistKey===distKey||(/sudur.*p.*chim|regional/.test(entryDistKey)&&distKey==='doti');
      const matchesQuery=(`${e.title} ${e.summary} ${e.district} ${e.municipality||''} ${e.category}`).toLowerCase().includes(search.toLowerCase());
      return matchesCat&&matchesDist&&matchesQuery;
    });
  },[entries,category,districtFilter,search]);

  const active=selected||filtered[0]||entries[0];

  // Keep selected item visible inside the scrollable browse list
  useEffect(()=>{
    if(!selected?.slug||!recordListRef.current)return;
    const btn=recordListRef.current.querySelector(`[data-record-slug="${CSS.escape(selected.slug)}"]`);
    btn?.scrollIntoView({block:'nearest',behavior:'smooth'});
  },[selected?.slug]);

  async function contribute(ev){
    ev.preventDefault();setFormError('');setBusy(true);
    const form=new FormData(ev.currentTarget),body=Object.fromEntries(form.entries());
    body.consent=form.get('consent')==='on';body.visibility='Restricted';
    try{
      const r=await fetch('/api/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();if(!r.ok)throw Error(d.error);
      const newPoint={
        slug:d.slug||`local-${Date.now()}`,
        heritageId:'NEW',
        title:body.title,
        summary:body.summary,
        description:body.summary,
        district:body.district||'Doti',
        category:'Community contribution',
        contributor:body.contributor,
        language:body.language||'Dotyali',
        source:`Contributed by ${body.contributor}`,
        status:'Pending review',
      };
      setEntries(prev=>[newPoint,...prev]);
      setSelected(newPoint);
      setNotice(d.message);setModal(false);ev.currentTarget.reset();
    }catch(e){
      setFormError(e.message||'Could not submit your story. Please try again later.');
    }finally{
      setBusy(false);setTimeout(()=>setNotice(''),5000);
    }
  }

  const route=window.location.pathname.replace(/\/+$/,'')||'/';
  if(route==='/studio')return <PageShell current="studio"><HeritageStudio/></PageShell>;
  if(route==='/guide')return <PageShell current="guide"><HeritageGuide entries={entries}/></PageShell>;
  if(route==='/review')return <PageShell current="review"><ReviewerPanel/></PageShell>;
  if(route==='/explorer')return <PageShell current="explore"><ExplorerPage entries={entries}/></PageShell>;
  if(route==='/stories')return <PageShell current="stories"><StoriesPage entries={entries}/></PageShell>;

  const hasActiveFilters=category!=='All'||districtFilter!=='All'||Boolean(search.trim());
  const resetAllFilters=()=>{setCategory('All');setDistrictFilter('All');setSearch('')};

  return <><header className="topbar"><a className="brand" href="/"><span className="brand-icon"><Compass size={21}/></span><span>SMART <b>HERITAGE</b></span></a><nav className={menu?'nav open':'nav'}><a className="nav-active" href="/explorer">Explore</a><a href="/stories">Stories</a><a href="/studio">3D Studio</a><a href="/guide">Guide</a><a href="/review">Review</a><a href="/#about">About</a></nav><div className="top-actions"><ThemeControls/><button className="lang" onClick={()=>setLang(lang==='EN'?'ने':'EN')}><Globe2 size={15}/>{lang}<ChevronDown size={13}/></button><button className="contribute" onClick={()=>setModal(true)}><Plus size={16}/> Contribute</button><button className="hamb" onClick={()=>setMenu(!menu)}><Menu/></button></div></header><main><section className="hero"><div className="hero-copy"><div className="eyebrow"><span></span> A LIVING ARCHIVE OF THE FAR WEST</div><h1>Every place holds<br/>a <em>story.</em></h1><p>Discover the places, people, and traditions that make Sudurpaschim extraordinary. Preserved together, shared for generations.</p><div className="hero-buttons"><a className="primary" href="#explore">Explore the atlas <ArrowRight size={16}/></a><button className="text-button" onClick={()=>setModal(true)}><Mic2 size={17}/> Share a story</button></div><a className="hero-studio-link" href="/studio"><Sparkles size={15}/> Open the 3D Studio <ArrowRight size={15}/></a><div className="hero-stats"><div><strong>9</strong><span>districts</span></div><i></i><div><strong>∞</strong><span>stories to tell</span></div><i></i><div><strong>१</strong><span>shared home</span></div></div></div><div className="hero-image"><img src="https://images.unsplash.com/photo-1605640840605-14ac1855827b?auto=format&fit=crop&w=1500&q=90"/><div className="image-shade"></div><div className="image-note"><span className="note-pin"><MapPin size={17}/></span><div><b>Far western Nepal</b><small>Seti · Mahakali · Karnali</small></div><ArrowUpRight size={17}/></div><div className="hero-caption">29°16' N &nbsp; 80°59' E <span>—</span> SUDURPASCHIM, NEPAL</div></div><div className="hero-mark">संस्कृति <span>·</span> स्मृति <span>·</span> समुदाय</div></section><section className="explore" id="explore"><div className="section-head"><div><div className="eyebrow dark">THE ATLAS <span>—</span> 01</div><h2>Find your way <em>in.</em></h2><p>Begin with a place, a practice, or a name you remember.</p></div><button className="outline-button" onClick={resetAllFilters}><SlidersHorizontal size={15}/> {hasActiveFilters?'Reset filters':'View all entries'} <span>{entries.length.toString().padStart(2,'0')}</span></button></div><div className="explorer"><div className="browse-panel"><div className="searchbox"><Search size={17}/><input ref={searchInputRef} placeholder="Search places, stories, traditions…" value={search} onChange={e=>setSearch(e.target.value)}/><span>⌘ K</span></div><div className="filter-label"><span>EXPLORE BY THEME</span><Filter size={14}/></div><div className="chips">{cats.map(c=><button className={category===c?'chip selected':'chip'} key={c} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="result-label"><span>FEATURED RECORDS {districtFilter!=='All'?`· ${districtFilter.toUpperCase()}`:''}</span><span>{filtered.length} FOUND</span></div>{hasActiveFilters&&<div className="browse-active-filter-bar"><span>Showing <b>{filtered.length}</b> of {entries.length}{districtFilter!=='All'&&<> in <b>{districtFilter}</b></>}{category!=='All'&&<> · <b>{category}</b></>}</span><button type="button" onClick={resetAllFilters}><RotateCcw size={11}/> Clear</button></div>}<div className="record-list" ref={recordListRef}>{filtered.map(e=><button key={e.slug} data-record-slug={e.slug} className={active?.slug===e.slug?'record active':'record'} onClick={()=>setSelected(e)}><HeritageImage entry={e}/><div><span className="record-cat">{e.category}</span><b>{e.title}</b><small><MapPin size={12}/>{e.district} District</small></div><ArrowRight size={15}/></button>)}{filtered.length===0&&<div className="empty">No records match that filter yet. <button type="button" className="empty-reset-btn" onClick={resetAllFilters}>Reset filters</button></div>}</div><div className="small-note"><ShieldCheck size={16}/><span>Each story is shared with care, consent, and community review.</span></div></div><div className="map-panel"><div className="map-top"><div className="map-legend"><span></span> OPENSTREETMAP <i>·</i> 3D GLOW CONSTELLATION</div><span className="map-district-level">{filtered.length} / {entries.length} GLOW POINTS</span></div><React.Suspense fallback={<div className="heritage-map-loading-fallback">Loading interactive OSM map…</div>}><HeritageMap entries={entries} filteredEntries={filtered} selectedSlug={active?.slug} onSelect={setSelected} activeDistrict={districtFilter} onDistrictChange={setDistrictFilter}/></React.Suspense><div className="map-foot"><span><MapPin size={15}/>Every entered heritage record is plotted as a glowing point inside its district. Coordinates are generalized for community privacy.</span><span className="map-data-credit">Boundary: <a href="https://github.com/l3lackcurtains/nepali-geo-pro-max" target="_blank" rel="noopener noreferrer">Nepal 2020 outline</a> · points: <a href="https://github.com/Niteshh-DeV/Drishya/tree/main/map-data" target="_blank" rel="noopener noreferrer">Drishya</a></span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></div></div></div></section><section className="story-section" id="stories"><div className="story-photo"><HeritageImage entry={active}/><ImageCredit entry={active}/><span className="photo-tag"><AudioLines size={14}/> FIELD NOTE · {active.language?.toUpperCase()||'ARCHIVAL'}</span></div><div className="story-copy"><div className="eyebrow dark">A STORY FROM {active.district?.toUpperCase()} <span>—</span> 02</div><h2>{active.title}</h2><p>{active.story||active.summary}</p><div className="story-meta"><span><BookOpen size={15}/>{active.source}</span><span><ShieldCheck size={15}/>{active.status}</span></div><button className="read-link" onClick={()=>setNotice(`${active.description} — Source: ${active.source}`)}>Read this story <ArrowRight size={16}/></button><div className="quote-mark">“</div></div></section><section className="values" id="about"><div><span>01 / COMMUNITY FIRST</span><b>Knowledge belongs<br/>with its people.</b></div><div><span>02 / TRUST, MADE VISIBLE</span><b>Sources, consent, and<br/>review in every record.</b></div><div><span>03 / A LIVING ARCHIVE</span><b>Built to grow, change,<br/>and be passed on.</b></div><div className="values-icon"><Heart size={24}/></div></section><section className="tools-index" id="tools"><div className="eyebrow dark">DIGITAL HERITAGE TOOLS <span>—</span> 03</div><h2>Go deeper into the <em>Atlas.</em></h2><p>Explore records, inspect a 3D study, ask the source-aware guide, or review community submissions.</p><div className="tool-card-grid"><a className="tool-card" href="/explorer"><span>01 · COLLECTION</span><b>Heritage Explorer</b><small>Search records by place, district, and theme.</small><ArrowRight size={17}/></a><a className="tool-card featured" href="/studio"><span>02 · INTERACTIVE</span><b>3D Studio</b><small>Rotate the model, select architectural parts, and import a SketchUp .glb.</small><ArrowRight size={17}/></a><a className="tool-card" href="/guide"><span>03 · SOURCE AWARE</span><b>Heritage Guide</b><small>Ask about sample records and see the source used.</small><ArrowRight size={17}/></a><a className="tool-card" href="/review"><span>04 · COMMUNITY</span><b>Review submissions</b><small>Authorized reviewers can approve or restrict contributed records.</small><ArrowRight size={17}/></a></div></section><footer><div className="brand"><span className="brand-icon"><Compass size={20}/></span><span>SMART <b>HERITAGE</b></span></div><span>A shared memory of Sudurpaschim.</span><button onClick={()=>setModal(true)}>Add your story <ArrowUpRight size={14}/></button></footer></main>{notice&&<div className="toast"><Check size={17}/>{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}{modal&&<div className="modal-backdrop" onClick={()=>setModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal(false)}><X size={18}/></button><div className="eyebrow dark">COMMUNITY CONTRIBUTION</div><h2>Share what you know.</h2><p>Your contribution stays private until a local reviewer checks consent, sources, and access.</p><form onSubmit={contribute}><label>Story or record title<input required name="title" placeholder="A place, practice, or memory"/></label><label>Short description<textarea required name="summary" rows="3" placeholder="What should people know?"/></label><div className="form-row"><label>District<select name="district" defaultValue="Doti">{DISTRICTS.map(d=><option key={d} value={d}>{d}</option>)}</select></label><label>Language<input name="language" placeholder="e.g. Dotyali"/></label></div><label>Your name or attribution<input required name="contributor" placeholder="How should we credit you?"/></label><label className="consent"><input required type="checkbox" name="consent"/> I have permission to share this material and agree it can be reviewed by the Atlas team.</label><div className="private-note"><ShieldCheck size={16}/> New submissions are restricted until reviewed.</div>{formError&&<div className="form-error" role="alert">{formError}</div>}<button className="primary submit" disabled={busy}>{busy?'Saving…':'Submit for community review'} <ArrowRight size={16}/></button></form></div></div>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
