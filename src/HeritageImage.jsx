import { useState } from 'react';

const placeholder=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><rect width="900" height="600" fill="#18211b"/><path d="M0 430 210 270l105 76 155-188 150 172 110-80 170 145v205H0z" fill="#21362a"/><path d="M0 472 240 326l144 112 142-166 140 154 100-77 134 112" fill="none" stroke="#386347" stroke-width="3"/><circle cx="710" cy="140" r="44" fill="#d6b66d" opacity=".7"/><text x="48" y="548" fill="#bdd5c0" font-family="sans-serif" font-size="20" letter-spacing="4">IMAGE SOURCE PENDING</text></svg>')}`;

export default function HeritageImage({entry,className='',...props}){
  const [failed,setFailed]=useState(false);
  const hasImage=Boolean(entry?.image&&!failed);
  return <img {...props} className={className} src={hasImage?entry.image:placeholder} alt={hasImage?entry.title:`Illustrative placeholder for ${entry?.title||'heritage record'}; no verified image source`} data-placeholder={hasImage?undefined:'true'} loading="lazy" onError={()=>setFailed(true)}/>;
}
