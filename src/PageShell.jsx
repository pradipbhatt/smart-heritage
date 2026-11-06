import { useState } from 'react';
import { Compass, Menu, Plus, X } from 'lucide-react';
import ThemeControls from './ThemeControls.jsx';

const links=[
  ['explore','Explore','/explorer'],
  ['stories','Stories','/stories'],
  ['studio','3D Studio','/studio'],
  ['guide','Guide','/guide'],
  ['review','Review','/review'],
  ['about','About','/#about'],
];

export default function PageShell({current,children}){
  const [menuOpen,setMenuOpen]=useState(false);
  return <>
    <header className="topbar page-topbar">
      <a className="brand" href="/">
        <span className="brand-icon"><Compass size={21}/></span>
        <span>SMART <b>HERITAGE</b></span>
      </a>
      <nav className={menuOpen?'nav open':'nav'}>
        {links.map(([id,label,href])=>(
          <a key={id} className={current===id?'nav-active':''} href={href} onClick={()=>setMenuOpen(false)}>
            {label}
          </a>
        ))}
      </nav>
      <div className="top-actions">
        <ThemeControls/>
        <a className="contribute" href="/?contribute=1"><Plus size={16}/> Contribute</a>
        <button className="hamb" type="button" aria-label="Toggle navigation menu" onClick={()=>setMenuOpen(v=>!v)}>
          {menuOpen?<X size={20}/>:<Menu size={20}/>}
        </button>
      </div>
    </header>
    <main className="feature-page">
      <a className="back-atlas" href="/#explore">← Back to the Atlas</a>
      {children}
    </main>
    <footer>
      <div className="brand">
        <span className="brand-icon"><Compass size={20}/></span>
        <span>SMART <b>HERITAGE</b></span>
      </div>
      <span>A shared memory of Sudurpaschim.</span>
      <a href="/">Home <span aria-hidden="true">↗</span></a>
    </footer>
  </>;
}
