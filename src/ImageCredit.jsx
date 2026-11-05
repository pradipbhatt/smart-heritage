export default function ImageCredit({entry,className=''}){
  if(!entry?.image||!entry?.imageSource||!entry?.imageCredit)return null;
  return <a className={`image-credit ${className}`} href={entry.imageSource} target="_blank" rel="noopener noreferrer">
    Photo: {entry.imageCredit} · {entry.imageLicense||'source'}
  </a>;
}
