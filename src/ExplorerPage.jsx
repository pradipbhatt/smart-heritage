import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, MapPin, RotateCcw, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import HeritageImage from './HeritageImage.jsx';
import ImageCredit from './ImageCredit.jsx';

export default function ExplorerPage({entries=[]}){
  const pageSize=10;
  const loadTest=new URLSearchParams(window.location.search).get('loadTest')==='1';
  const params=new URLSearchParams(window.location.search);
  const [query,setQuery]=useState(''),[theme,setTheme]=useState('All'),[district,setDistrict]=useState('All'),[sort,setSort]=useState('featured'),[active,setActive]=useState(()=>entries.find(entry=>entry.slug===params.get('record'))||entries[0]),[page,setPage]=useState(1),[loadTestEntries,setLoadTestEntries]=useState(null),[loadTestError,setLoadTestError]=useState('');
  useEffect(()=>{
    if(!loadTest)return;
    let cancelled=false;
    fetch('/api/entries?loadTest=1').then(response=>{if(!response.ok)throw new Error('The load-test dataset could not be loaded.');return response.json()}).then(data=>{if(!Array.isArray(data))throw new Error('The load-test response was invalid.');if(!cancelled){setLoadTestEntries(data);setLoadTestError('')}}).catch(error=>{if(!cancelled)setLoadTestError(error.message)});
    return()=>{cancelled=true};
  },[loadTest]);
  const sourceEntries=loadTest?(loadTestEntries||entries):entries;
  const themes=useMemo(()=>['All',...new Set(sourceEntries.map(entry=>entry.category).filter(Boolean))],[sourceEntries]);
  const districts=useMemo(()=>['All',...new Set(sourceEntries.map(entry=>entry.district).filter(Boolean))],[sourceEntries]);
  const filtered=useMemo(()=>{
    const normalized=query.trim().toLocaleLowerCase();
    const matches=sourceEntries.filter(entry=>(theme==='All'||entry.category===theme)&&(district==='All'||entry.district===district)&&`${entry.title} ${entry.summary} ${entry.description||''} ${entry.district} ${entry.municipality||''} ${entry.category} ${(entry.aliases||[]).join(' ')} ${entry.architecturalFeatures||''}`.toLocaleLowerCase().includes(normalized));
    return matches.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='district'?a.district.localeCompare(b.district)||a.title.localeCompare(b.title):sort==='newest'?(b.heritageId||'').localeCompare(a.heritageId||''):0);
  },[sourceEntries,theme,district,query,sort]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visibleEntries=useMemo(()=>filtered.slice((page-1)*pageSize,page*pageSize),[filtered,page]);
  const paginationItems=useMemo(()=>{
    if(pageCount<=7)return Array.from({length:pageCount},(_,index)=>index+1);
    const items=[1];
    if(page>3)items.push('left-gap');
    for(let number=Math.max(2,page-1);number<=Math.min(page+1,pageCount-1);number++)items.push(number);
    if(page<pageCount-2)items.push('right-gap');
    items.push(pageCount);
    return items;
  },[page,pageCount]);
  const selected=filtered.find(entry=>entry.slug===active?.slug)||filtered[0];
  useEffect(()=>setPage(1),[query,theme,district,sort]);
  useEffect(()=>{if(page>pageCount)setPage(pageCount)},[page,pageCount]);
  useEffect(()=>{const index=filtered.findIndex(entry=>entry.slug===selected?.slug);if(index>=0)setPage(Math.floor(index/pageSize)+1)},[selected?.slug]);
  useEffect(()=>{
    const url=new URL(window.location.href);
    if(selected?.slug)url.searchParams.set('record',selected.slug);else url.searchParams.delete('record');
    window.history.replaceState({},'',url);
  },[selected?.slug]);
  const chooseRecord=(entry)=>{setActive(entry);if(!visibleEntries.some(item=>item.slug===entry.slug)){const index=filtered.findIndex(item=>item.slug===entry.slug);setPage(Math.floor(index/pageSize)+1)}};
  return <section className="standalone-explorer">
    <div className="eyebrow dark">THE ATLAS <span>—</span> 01</div><h1>Explore heritage <em>records.</em></h1>
    <p>Search source-linked records by place, district, or tradition. Photos and 3D models appear when verified or uploaded.</p>
    <div className="explorer-controls">
      <label className="searchbox"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search places, stories, traditions…"/><kbd>⌘ K</kbd></label>
      <label className="district-filter">District<select value={district} onChange={event=>setDistrict(event.target.value)}>{districts.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="district-filter sort-filter"><SlidersHorizontal size={15}/><span>Sort</span><select value={sort} onChange={event=>setSort(event.target.value)}><option value="featured">Featured</option><option value="title">Name A–Z</option><option value="district">District</option><option value="newest">Record ID</option></select></label>
    </div>
    <div className="chips">{themes.map(value=><button className={theme===value?'chip selected':'chip'} key={value} onClick={()=>setTheme(value)}>{value}</button>)}</div>
    {loadTest&&<div className="active-filters"><span><strong>LOAD TEST MODE</strong> · {loadTestEntries?`${loadTestEntries.filter(entry=>entry.heritageId?.startsWith('LOADTEST-')).length.toLocaleString()} synthetic records loaded`:loadTestError||'Loading synthetic records…'}</span><a href="/explorer">Exit load test</a></div>}
    {(query||theme!=='All'||district!=='All'||sort!=='featured')&&<div className="active-filters"><span><b>{filtered.length}</b> matching records{query&&<> for <strong>“{query.trim()}”</strong></>}{district!=='All'&&<> in <strong>{district}</strong></>}{theme!=='All'&&<> · <strong>{theme}</strong></>}</span><button onClick={()=>{setQuery('');setTheme('All');setDistrict('All');setSort('featured');setPage(1)}}><RotateCcw size={13}/> Clear filters</button></div>}
    <div className="standalone-results">
      <div className="standalone-list">
        <div className="result-label">PUBLIC RECORDS <span>{filtered.length?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,filtered.length)} OF ${filtered.length}`:'0 RECORDS'}</span></div>
        {visibleEntries.map(entry=><button key={entry.slug} className={`record ${selected?.slug===entry.slug?'active':''}`} onClick={()=>setActive(entry)} aria-current={selected?.slug===entry.slug?'true':undefined}>
          <HeritageImage entry={entry}/><div><span className="record-cat">{entry.category}</span><b>{entry.title}</b><small><MapPin size={12}/>{entry.district} District</small></div><ArrowRight size={15}/>
        </button>)}
        {filtered.length===0&&<p className="empty">No public records match those filters.</p>}
        {filtered.length>pageSize&&<nav className="pagination" aria-label="Heritage record pages"><span>Page {page} of {pageCount}</span><div className="pagination-pages"><button aria-label="Previous page" disabled={page===1} onClick={()=>setPage(page-1)}><ArrowLeft size={15}/></button>{paginationItems.map(item=>typeof item==='number'?<button key={item} className={item===page?'current':''} aria-label={`Page ${item}`} aria-current={item===page?'page':undefined} onClick={()=>setPage(item)}>{item}</button>:<span className="pagination-ellipsis" key={item} aria-hidden="true">…</span>)}<button aria-label="Next page" disabled={page===pageCount} onClick={()=>setPage(page+1)}><ArrowRight size={15}/></button></div></nav>}
        <div className="small-note"><ShieldCheck size={16}/><span>Precise coordinates and restricted community knowledge are not shown.</span></div>
      </div>
      {selected&&<article className="standalone-detail">
        <div className="detail-image-wrap"><HeritageImage entry={selected}/><span className="detail-image-label">{selected.image?'HERITAGE IMAGE':'RECORD PREVIEW'}</span></div><ImageCredit entry={selected}/>
        <div className="detail-heading"><span className="record-cat">{selected.heritageId||selected.slug} <i>·</i> {selected.category}</span><h2>{selected.title}</h2><div className="detail-place"><MapPin size={16}/><span>{selected.district}{selected.municipality?` · ${selected.municipality}`:''}</span><span className="detail-status"><ShieldCheck size={14}/>{selected.status||'Source linked'}</span></div></div>
        <section className="detail-section"><h3>About this place</h3><p>{selected.description||selected.summary}</p></section>
        {selected.architecturalFeatures&&<section className="detail-section detail-feature"><h3>Architectural features</h3><p>{selected.architecturalFeatures}</p></section>}
        {selected.story&&<section className="detail-story"><BookOpen size={17}/><div><h3>Community story</h3><p>{selected.story}</p></div></section>}
        <div className="detail-meta-grid"><div><span>HERITAGE CATEGORY</span><b>{selected.category}</b></div><div><span>LOCATION</span><b>{selected.district}</b></div><div><span>RECORD ID</span><b>{selected.heritageId||'Community record'}</b></div><div><span>CONTRIBUTION STATUS</span><b>{selected.status||'Source linked'}</b></div></div>
        {selected.sourceUrls?.length>0&&<div className="record-sources"><b>References <small>({selected.sourceUrls.length})</small></b><p>Read the sources used to prepare this record.</p>{selected.sourceUrls.map((url,index)=>{let host=url;try{host=new URL(url).hostname.replace(/^www\./,'')}catch{}return <a key={url} href={url} target="_blank" rel="noopener noreferrer"><span><small>SOURCE {String(index+1).padStart(2,'0')}</small>{host}</span><ArrowRight size={15}/></a>})}</div>}
        {filtered.length>1&&<button className="detail-next" onClick={()=>chooseRecord(filtered[(filtered.findIndex(entry=>entry.slug===selected.slug)+1)%filtered.length])}>Explore next record <ArrowRight size={15}/></button>}
      </article>}
    </div>
  </section>;
}
