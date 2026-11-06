import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, ArrowRight, Box, Compass, Database, Layers, LocateFixed, Map as MapIcon, MapPin, Moon, Mountain, Sparkles, Sun } from 'lucide-react';

const districtsUrl='/data/nepal-districts-2020.geojson';
const farWestPointsUrl='/data/sudurpaschim-districts.simplified.geojson';
const tileUrl='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const topoTileUrl='https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const normalizeDistrict=value=>String(value||'').toLowerCase().replace(/\s*\(regional\)/,'').replace(/[^a-z]/g,'');

const ORDERED_DISTRICTS=[
  {key:'darchula',name:'Darchula',peak:'7,132m',landmark:'Api Himal',zone:'High Himalaya',tier:5},
  {key:'bajhang',name:'Bajhang',peak:'7,031m',landmark:'Saipal Himal',zone:'High Himalaya',tier:5},
  {key:'bajura',name:'Bajura',peak:'6,410m',landmark:'Badimalika Ridge',zone:'Alpine Himalaya',tier:4},
  {key:'baitadi',name:'Baitadi',peak:'2,950m',landmark:'Ninglashaini Ridge',zone:'Mahabharat Range',tier:3},
  {key:'doti',name:'Doti',peak:'3,438m',landmark:'Khaptad Plateau',zone:'Mid-Hill Plateau',tier:3},
  {key:'dadeldhura',name:'Dadeldhura',peak:'2,639m',landmark:'Amargadhi Crest',zone:'Mahabharat Range',tier:3},
  {key:'achham',name:'Achham',peak:'3,820m',landmark:'Ramaroshan Basin',zone:'Mid-Hill Valley',tier:2},
  {key:'kailali',name:'Kailali',peak:'1,950m',landmark:'Chure Foothills',zone:'Terai – Chure',tier:1},
  {key:'kanchanpur',name:'Kanchanpur',peak:'1,528m',landmark:'Mahakali Plains',zone:'Terai Plains',tier:1},
];

const DISTRICT_RELIEF=Object.fromEntries([
  ...ORDERED_DISTRICTS.map(d=>[d.key,d]),
  ['sudurpaschim',{key:'sudurpaschim',name:'Sudurpashchim',peak:'7,132m',landmark:'Terai to Api Himal',zone:'Regional Relief',tier:4}],
]);

const KNOWN_SITE_COORDS={
  'ugratara-temple-dadeldhura':[29.336,80.584],
  'amaragadhi-fort':[29.299,80.587],
  'ajaymeru-kot-dadeldhura':[29.266,80.448],
  'badimalika-temple-bajura':[29.462,81.495],
  'gaura-parva':[29.235,80.765],
  'ramaroshan-area':[29.242,81.448],
  'baidyanath-dham-achham':[29.124,81.218],
  'bedkot-lake':[29.018,80.268],
  'jhilmila-lake-kanchanpur':[29.076,80.196],
  'malikarjun-temple-darchula':[29.742,80.495],
  'malla-palace-kailali':[28.755,80.765],
  'tripurasundari-temple-baitadi':[29.554,80.418],
  'melauli-bhagawati-temple-baitadi':[29.418,80.522],
  'patal-bhumeshwar-cave-baitadi':[29.592,80.568],
  'surma-devi-temple-bajhang':[29.554,81.196],
  'surma-sarovar-bajhang':[29.812,81.175],
  'shaileshwori-temple-doti':[29.268,80.982],
};

function getDistrictRelief(districtName){
  const key=normalizeDistrict(districtName);
  return DISTRICT_RELIEF[key]||{key,name:districtName||'Sudurpashchim',peak:'2,800m',landmark:'Far West Nepal',zone:'Hill & Mountain',tier:3};
}

function hashString(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){
    h^=str.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return h>>>0;
}

function pointInRing(lon,lat,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1];
    const xj=ring[j][0],yj=ring[j][1];
    const intersect=((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi);
    if(intersect)inside=!inside;
  }
  return inside;
}

function pointInGeometry(lon,lat,geometry){
  if(!geometry)return false;
  if(geometry.type==='Polygon'){
    return geometry.coordinates[0]?pointInRing(lon,lat,geometry.coordinates[0]):false;
  }
  if(geometry.type==='MultiPolygon'){
    return geometry.coordinates.some(poly=>poly[0]&&pointInRing(lon,lat,poly[0]));
  }
  return false;
}

function resolveEntryLatLng(entry,index,districtCenters,districtGeometries,farWestCenter){
  if(entry.coordinates&&Number.isFinite(entry.coordinates.lat)&&Number.isFinite(entry.coordinates.lng)){
    return [entry.coordinates.lat,entry.coordinates.lng];
  }
  if(entry.slug&&KNOWN_SITE_COORDS[entry.slug]){
    return KNOWN_SITE_COORDS[entry.slug];
  }
  const rawKey=normalizeDistrict(entry.district);
  const key=/sudur.*p.*chim|farwest|regional|province/.test(rawKey)?'doti':rawKey;
  const center=districtCenters.get(key)||farWestCenter||L.latLng(29.25,80.85);
  const geom=districtGeometries.get(key);
  const seed=hashString(`${entry.slug||entry.heritageId||entry.title||'pt'}-${index}`);

  const goldenAngle=2.399963229728653;
  for(let attempt=0;attempt<18;attempt++){
    const angle=((seed%360)*Math.PI/180)+(attempt*goldenAngle);
    const radius=0.025+(((seed>>>8)%1000)/1000)*0.19*(1-attempt*0.035);
    const lat=center.lat+Math.sin(angle)*radius*0.82;
    const lon=center.lng+Math.cos(angle)*radius*1.05;
    if(!geom||pointInGeometry(lon,lat,geom)){
      return [lat,lon];
    }
  }
  const fallbackAngle=(seed%360)*Math.PI/180;
  return [center.lat+Math.sin(fallbackAngle)*0.035,center.lng+Math.cos(fallbackAngle)*0.035];
}

function decimateShiftFeatures(features,latOffset,lonOffset,stride=4){
  return {
    type:'FeatureCollection',
    features:features.map(feature=>{
      const simplifyRing=ring=>{
        if(ring.length<=12)return ring.map(([lon,lat])=>[lon+lonOffset,lat+latOffset]);
        const out=[];
        for(let i=0;i<ring.length-1;i+=stride){
          out.push([ring[i][0]+lonOffset,ring[i][1]+latOffset]);
        }
        const first=out[0];
        if(first)out.push([first[0],first[1]]);
        return out;
      };
      const geometry=feature.geometry?.type==='Polygon'
        ?{type:'Polygon',coordinates:feature.geometry.coordinates.map(simplifyRing)}
        :feature.geometry?.type==='MultiPolygon'
        ?{type:'MultiPolygon',coordinates:feature.geometry.coordinates.map(poly=>poly.map(simplifyRing))}
        :feature.geometry;
      return {...feature,geometry};
    }),
  };
}

function recordPopupContent(entry,onSelect){
  const relief=getDistrictRelief(entry.district);
  const root=document.createElement('div');root.className='heritage-popup heritage-point-popup';
  const meta=document.createElement('div');meta.className='heritage-popup-kicker';
  meta.textContent=`${entry.heritageId||'RECORD'} · ${entry.category||'Heritage'}`;
  root.append(meta);

  const heading=document.createElement('strong');heading.className='heritage-popup-title';
  heading.textContent=entry.title;
  root.append(heading);

  const place=document.createElement('div');place.className='heritage-popup-elevation';
  place.textContent=`${entry.district}${entry.municipality?` · ${entry.municipality}`:''} · ▲ ${relief.peak}`;
  root.append(place);

  if(entry.summary){
    const summary=document.createElement('p');summary.className='heritage-popup-summary';
    summary.textContent=entry.summary;
    root.append(summary);
  }

  const actions=document.createElement('div');actions.className='heritage-popup-actions';
  const button=document.createElement('button');button.type='button';button.className='heritage-popup-action-btn';
  button.textContent='Read Story ↓';
  button.addEventListener('click',()=>onSelect(entry));

  const link=document.createElement('a');link.className='heritage-popup-link';
  link.href=`/explorer?record=${encodeURIComponent(entry.slug||'')}`;
  link.textContent='Explorer →';
  actions.append(button,link);
  root.append(actions);

  L.DomEvent.disableClickPropagation(root);
  return root;
}

function districtPopupContent(district,entries,onSelect){
  const relief=getDistrictRelief(district);
  const root=document.createElement('div');root.className='heritage-popup';
  const heading=document.createElement('strong');heading.className='heritage-popup-title';heading.textContent=district;root.append(heading);
  const badge=document.createElement('div');badge.className='heritage-popup-elevation';
  badge.textContent=`▲ ${relief.peak} · ${relief.zone} (${relief.landmark})`;
  root.append(badge);
  const note=document.createElement('span');note.className='heritage-popup-note';
  note.textContent=`${entries.length} glowing data ${entries.length===1?'point':'points'} in ${district}`;
  root.append(note);
  if(normalizeDistrict(district)==='darchula'){
    const context=document.createElement('small');context.className='heritage-popup-more';
    context.textContent='Kalapani–Lipulekh area is shown according to Nepal’s 2020 political map. The international boundary is disputed.';
    root.append(context);
  }
  const list=document.createElement('div');list.className='heritage-popup-list';
  entries.slice(0,8).forEach(entry=>{
    const button=document.createElement('button');button.type='button';button.className='heritage-popup-record';
    const title=document.createElement('span');title.textContent=entry.title;
    const category=document.createElement('small');category.textContent=entry.category;
    button.append(title,category);button.addEventListener('click',()=>onSelect(entry));list.append(button);
  });
  root.append(list);
  if(entries.length>8){
    const remaining=document.createElement('small');remaining.className='heritage-popup-more';
    remaining.textContent=`Showing 8 of ${entries.length} points. Click any glowing point on the map or browse in Explorer.`;
    root.append(remaining);
  }
  const link=document.createElement('a');link.className='heritage-popup-link';link.href='/explorer';link.textContent='Open heritage explorer →';root.append(link);
  L.DomEvent.disableClickPropagation(root);
  return root;
}

function maskCoordinates(features){
  const outer=[[0,50],[0,125],[60,125],[60,50],[0,50]];
  const regionRings=[];
  features.forEach(feature=>{
    const geometry=feature.geometry;
    const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
    polygons.forEach(polygon=>{if(polygon[0])regionRings.push(polygon[0].map(([lon,lat])=>[lat,lon]))});
  });
  return [outer,...regionRings];
}

export default function HeritageMap({entries=[],filteredEntries=null,selectedSlug,onSelect=()=>{},activeDistrict='All',onDistrictChange=null}){
  const host=useRef(null),map=useRef(null),glowMarkersRef=useRef(null),canvasPointsRef=useRef(null),districtLabelsRef=useRef(null),canvasRendererRef=useRef(null),topoLayerRef=useRef(null);
  const districtCenters=useRef(new Map()),districtBoundsRef=useRef(new Map()),districtLayersRef=useRef(new Map()),districtGeometries=useRef(new Map()),pointMarkersBySlug=useRef(new Map()),farWestBounds=useRef(null);
  const [ready,setReady]=useState(false),[boundaryStatus,setBoundaryStatus]=useState('loading');
  const [mapStyle,setMapStyle]=useState(()=>localStorage.getItem('heritage-map-style')||'night');
  const [is3D,setIs3D]=useState(()=>localStorage.getItem('heritage-map-3d')!=='0');
  const [reliefOverlay,setReliefOverlay]=useState(true);
  const [showAllDbPoints,setShowAllDbPoints]=useState(false);
  const [allDbEntries,setAllDbEntries]=useState(null);
  const [loadingDbPoints,setLoadingDbPoints]=useState(false);
  const [hoveredDistrict,setHoveredDistrict]=useState(null);
  const [focusedDistrictKey,setFocusedDistrictKey]=useState('all');
  const [themeTick,setThemeTick]=useState(0);

  // Re-sync canvas colors when theme/accent changes on <html>
  useEffect(()=>{
    const observer=new MutationObserver(()=>setThemeTick(t=>t+1));
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-accent','style']});
    return()=>observer.disconnect();
  },[]);

  const selectRecord=useCallback(entry=>{
    onSelect(entry);
    document.getElementById('stories')?.scrollIntoView({behavior:'smooth',block:'start'});
  },[onSelect]);

  useEffect(()=>{
    if(!showAllDbPoints||allDbEntries)return;
    let cancelled=false;
    setLoadingDbPoints(true);
    fetch('/api/entries?loadTest=1')
      .then(r=>r.ok?r.json():null)
      .then(data=>{if(!cancelled&&Array.isArray(data))setAllDbEntries(data)})
      .catch(()=>{})
      .finally(()=>{if(!cancelled)setLoadingDbPoints(false)});
    return()=>{cancelled=true};
  },[showAllDbPoints,allDbEntries]);

  const activeDataset=useMemo(()=>{
    if(!showAllDbPoints||!allDbEntries)return entries;
    const seen=new Set(entries.map(e=>e.slug));
    return [...entries,...allDbEntries.filter(e=>!seen.has(e.slug))];
  },[entries,showAllDbPoints,allDbEntries]);

  const matchingSlugSet=useMemo(()=>{
    if(!Array.isArray(filteredEntries))return null;
    return new Set(filteredEntries.map(e=>e.slug));
  },[filteredEntries]);

  const districtCounts=useMemo(()=>{
    const counts=new Map();
    activeDataset.forEach(entry=>{
      const rawKey=normalizeDistrict(entry.district);
      const key=/sudur.*p.*chim|farwest|regional|province/.test(rawKey)?'doti':rawKey||'doti';
      counts.set(key,(counts.get(key)||0)+1);
    });
    return counts;
  },[activeDataset]);

  useEffect(()=>{
    if(!host.current)return;
    const instance=L.map(host.current,{
      scrollWheelZoom:true,wheelDebounceTime:35,wheelPxPerZoomLevel:100,
      zoomSnap:.5,zoomDelta:.5,zoomControl:false,preferCanvas:true,
      inertia:true,inertiaDeceleration:3000,inertiaMaxSpeed:1500,easeLinearity:.2,
      zoomAnimation:true,fadeAnimation:true,markerZoomAnimation:true,minZoom:7,maxZoom:19,
    }).setView([29.25,80.7],7.5);

    instance.createPane('nepal-context-mask');
    instance.getPane('nepal-context-mask').style.zIndex='440';
    instance.getPane('nepal-context-mask').style.pointerEvents='none';

    instance.createPane('nepal-districts-extrusion');
    instance.getPane('nepal-districts-extrusion').style.zIndex='448';
    instance.getPane('nepal-districts-extrusion').style.pointerEvents='none';

    instance.createPane('nepal-districts');
    instance.getPane('nepal-districts').style.zIndex='455';

    instance.createPane('heritage-glow-canvas');
    instance.getPane('heritage-glow-canvas').style.zIndex='620';

    L.tileLayer(tileUrl,{
      minZoom:5,maxZoom:19,keepBuffer:2,updateWhenIdle:true,updateWhenZooming:false,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }).addTo(instance);

    const topoLayer=L.tileLayer(topoTileUrl,{
      minZoom:5,maxZoom:17,opacity:.24,className:'heritage-topo-relief-tiles',
      attribution:'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
    }).addTo(instance);
    topoLayerRef.current=topoLayer;

    L.control.zoom({position:'topright'}).addTo(instance);

    const svgExtrusionRenderer=L.svg({pane:'nepal-districts-extrusion',padding:0.25});
    const svgDistrictRenderer=L.svg({pane:'nepal-districts',padding:0.25});
    const glowCanvasRenderer=L.canvas({pane:'heritage-glow-canvas',padding:0.5});
    canvasRendererRef.current=glowCanvasRenderer;

    const districtLabelLayer=L.layerGroup().addTo(instance);
    const canvasPointLayer=L.layerGroup().addTo(instance);
    const glowMarkerLayer=L.layerGroup().addTo(instance);

    map.current=instance;
    districtLabelsRef.current=districtLabelLayer;
    canvasPointsRef.current=canvasPointLayer;
    glowMarkersRef.current=glowMarkerLayer;
    setReady(true);

    const controller=new AbortController();
    Promise.all([
      fetch(districtsUrl,{signal:controller.signal}),
      fetch(farWestPointsUrl,{signal:controller.signal}),
    ]).then(async([districtResponse,farWestResponse])=>{
      if(!districtResponse.ok||!farWestResponse.ok)throw new Error('Map data could not be loaded.');
      return Promise.all([districtResponse.json(),farWestResponse.json()]);
    }).then(([districtData,farWestData])=>{
      if(controller.signal.aborted||!Array.isArray(districtData.features))return;
      const farWestFeatures=districtData.features.filter(feature=>feature.properties?.provinceId==='P7');

      const simplifiedSource=Array.isArray(farWestData.features)&&farWestData.features.length
        ?farWestData.features
        :farWestFeatures;
      L.geoJSON(decimateShiftFeatures(simplifiedSource,-0.024,0.014,4),{
        pane:'nepal-districts-extrusion',
        renderer:svgExtrusionRenderer,
        interactive:false,
        style:feature=>{
          const relief=getDistrictRelief(feature.properties?.name);
          return {
            color:'var(--atlas-accent-strong)',
            weight:1.2+(relief.tier*0.28),
            opacity:0.42,
            fillColor:'#08110c',
            fillOpacity:0.34,
            className:'heritage-extrusion-slab',
          };
        },
      }).addTo(instance);

      const boundaryLayer=L.geoJSON({...districtData,features:farWestFeatures},{
        pane:'nepal-districts',
        renderer:svgDistrictRenderer,
        style:feature=>{
          const name=feature.properties?.name;
          const isDarchula=name==='Darchula';
          const relief=getDistrictRelief(name);
          return {
            color:'var(--atlas-accent-strong)',
            weight:isDarchula?2.2:1.35,
            opacity:.88,
            fillColor:'var(--atlas-accent)',
            fillOpacity:0.06+(relief.tier*0.024),
            className:`heritage-district-prism tier-${relief.tier}`,
          };
        },
        onEachFeature(feature,layer){
          const name=feature.properties?.name;if(!name)return;
          const relief=getDistrictRelief(name);
          const label=name==='Darchula'
            ?`Darchula · ▲ ${relief.peak} (${relief.landmark}) · Nepal’s 2020 map extent`
            :`${name} · ▲ ${relief.peak} · ${relief.zone}`;
          layer.bindTooltip(label,{sticky:true,direction:'top',offset:[0,-8],className:'heritage-district-label'});
          layer.on({
            mouseover:()=>{
              setHoveredDistrict({name,...relief});
              layer.setStyle({weight:2.5,fillOpacity:0.22});
            },
            mouseout:()=>{
              setHoveredDistrict(null);
              boundaryLayer.resetStyle(layer);
            },
          });
        },
      });

      const districtLayers=boundaryLayer.getLayers();
      const farWest=boundaryLayer.getBounds();
      const centers=new Map();
      const boundsMap=new Map();
      const layersMap=new Map();
      const geoms=new Map();

      districtLayers.forEach(layer=>{
        const feature=layer.feature;
        const name=feature.properties?.name;if(!name)return;
        const key=normalizeDistrict(name);
        const b=layer.getBounds();
        centers.set(key,b.getCenter());
        boundsMap.set(key,b);
        layersMap.set(key,layer);
        geoms.set(key,feature.geometry);
      });
      farWestData.features?.forEach(feature=>{
        const name=feature.properties?.name;if(!name)return;
        const key=normalizeDistrict(name);
        const lat=Number(feature.properties.center_lat),lon=Number(feature.properties.center_lon);
        if(Number.isFinite(lat)&&Number.isFinite(lon))centers.set(key,L.latLng(lat,lon));
        if(!geoms.has(key)&&feature.geometry)geoms.set(key,feature.geometry);
      });

      districtCenters.current=centers;
      districtBoundsRef.current=boundsMap;
      districtLayersRef.current=layersMap;
      districtGeometries.current=geoms;
      farWestBounds.current=farWest;

      L.polygon(maskCoordinates(farWestFeatures),{
        pane:'nepal-context-mask',stroke:false,fillColor:'var(--atlas-surface)',fillOpacity:1,fillRule:'evenodd',interactive:false,
      }).addTo(instance);

      boundaryLayer.addTo(instance);
      const paddedBounds=farWest.pad(.2);
      instance.setMaxBounds(paddedBounds);
      instance.options.maxBoundsViscosity=.9;
      instance.fitBounds(farWest,{padding:[28,28],maxZoom:8.5});
      setBoundaryStatus('ready');
    }).catch(error=>{if(error.name!=='AbortError')setBoundaryStatus('unavailable')});

    return()=>{
      controller.abort();
      glowMarkersRef.current?.clearLayers();
      canvasPointsRef.current?.clearLayers();
      districtLabelsRef.current?.clearLayers();
      instance.remove();
      map.current=null;
      setReady(false);
    };
  },[]);

  useEffect(()=>{
    if(!topoLayerRef.current)return;
    topoLayerRef.current.setOpacity(reliefOverlay?(is3D?0.26:0.16):0);
  },[reliefOverlay,is3D]);

  useEffect(()=>{
    if(!ready||!map.current||boundaryStatus!=='ready')return;
    const glowLayer=glowMarkersRef.current;
    const canvasLayer=canvasPointsRef.current;
    const labelLayer=districtLabelsRef.current;
    const renderer=canvasRendererRef.current;
    if(!glowLayer||!canvasLayer||!labelLayer)return;

    glowLayer.clearLayers();
    canvasLayer.clearLayers();
    labelLayer.clearLayers();
    pointMarkersBySlug.current.clear();

    const farWestCenter=farWestBounds.current?.getCenter();
    const byDistrict=new Map();

    activeDataset.forEach(entry=>{
      const rawKey=normalizeDistrict(entry.district);
      const key=/sudur.*p.*chim|farwest|regional|province/.test(rawKey)?'doti':rawKey||'doti';
      const bucket=byDistrict.get(key)||{district:entry.district||'Sudurpashchim',entries:[]};
      bucket.entries.push(entry);
      byDistrict.set(key,bucket);
    });

    districtCenters.current.forEach((center,key)=>{
      const bucket=byDistrict.get(key);
      const count=bucket?bucket.entries.length:0;
      const districtTitle=ORDERED_DISTRICTS.find(d=>d.key===key)?.name||bucket?.district?.replace(/\s*\(regional\)/i,'')||(key.charAt(0).toUpperCase()+key.slice(1));
      const isFocused=focusedDistrictKey===key;
      const labelIcon=L.divIcon({
        className:`heritage-district-hub-pill ${isFocused?'is-focused':''}`,
        html:`<span><b>${districtTitle}</b><i>${count}</i></span>`,
        iconSize:[96,22],
        iconAnchor:[48,-10],
      });
      const hubMarker=L.marker(center,{icon:labelIcon,interactive:true,keyboard:false,zIndexOffset:isFocused?100:-200});
      if(bucket?.entries?.length){
        hubMarker.bindPopup(()=>districtPopupContent(districtTitle,bucket.entries,selectRecord),{maxWidth:300,minWidth:210,autoPanPadding:[24,24]});
      }
      hubMarker.addTo(labelLayer);
    });

    const accentColor=getComputedStyle(document.documentElement).getPropertyValue('--atlas-accent').trim()||'#82b58d';

    activeDataset.forEach((entry,index)=>{
      const [lat,lon]=resolveEntryLatLng(entry,index,districtCenters.current,districtGeometries.current,farWestCenter);
      const isSelected=entry.slug===selectedSlug;
      const entryDistrictKey=normalizeDistrict(entry.district);
      const matchesDistrictFocus=focusedDistrictKey==='all'||entryDistrictKey===focusedDistrictKey||(/sudur.*p.*chim|regional/.test(entryDistrictKey)&&focusedDistrictKey==='doti');
      const isMatched=(!matchingSlugSet||matchingSlugSet.has(entry.slug))&&matchesDistrictFocus;
      const isSynthetic=Boolean(entry.slug?.startsWith('loadtest-sample-'));
      const isContribution=entry.category==='Community contribution'||entry.status==='Pending review';

      if(isSynthetic&&!isSelected){
        const halo=L.circleMarker([lat,lon],{
          renderer,
          pane:'heritage-glow-canvas',
          radius:isMatched?6.5:3.5,
          stroke:false,
          fillColor:accentColor,
          fillOpacity:isMatched?0.24:0.05,
          interactive:false,
        });
        const core=L.circleMarker([lat,lon],{
          renderer,
          pane:'heritage-glow-canvas',
          radius:isMatched?2.8:1.6,
          color:accentColor,
          weight:1,
          opacity:isMatched?0.85:0.18,
          fillColor:'#ffffff',
          fillOpacity:isMatched?0.92:0.22,
        });
        core.bindTooltip(`${entry.title} · ${entry.district}`,{direction:'top',offset:[0,-6],className:'heritage-district-label'});
        core.bindPopup(()=>recordPopupContent(entry,selectRecord),{maxWidth:280,minWidth:200});
        halo.addTo(canvasLayer);
        core.addTo(canvasLayer);
        if(entry.slug)pointMarkersBySlug.current.set(entry.slug,core);
        return;
      }

      const stateClass=[
        'heritage-glow-point',
        isSelected?'is-selected':'',
        !isMatched?'is-dimmed':'',
        isContribution?'is-contribution':'',
      ].filter(Boolean).join(' ');

      const icon=L.divIcon({
        className:stateClass,
        html:`
          <div class="glow-orb-wrap">
            <i class="glow-orb-pulse" aria-hidden="true"></i>
            <i class="glow-orb-halo" aria-hidden="true"></i>
            <span class="glow-orb-core"></span>
            <em class="glow-orb-label">${entry.title}</em>
          </div>
        `,
        iconSize:[24,24],
        iconAnchor:[12,12],
        popupAnchor:[0,-12],
      });

      const marker=L.marker([lat,lon],{
        icon,
        title:`${entry.title} (${entry.district})`,
        alt:`${entry.title}, ${entry.category} in ${entry.district}`,
        keyboard:true,
        zIndexOffset:isSelected?900:(isContribution?600:300),
      });
      marker.bindPopup(()=>recordPopupContent(entry,selectRecord),{maxWidth:290,minWidth:210,autoPanPadding:[24,24]});
      marker.on('click',()=>onSelect(entry));
      marker.addTo(glowLayer);
      if(entry.slug)pointMarkersBySlug.current.set(entry.slug,marker);
    });
  },[activeDataset,matchingSlugSet,focusedDistrictKey,ready,boundaryStatus,selectedSlug,selectRecord,onSelect,themeTick]);

  useEffect(()=>{
    if(!selectedSlug||!map.current||boundaryStatus!=='ready')return;
    const marker=pointMarkersBySlug.current.get(selectedSlug);
    if(marker?.getLatLng){
      const target=marker.getLatLng();
      map.current.flyTo(target,Math.max(map.current.getZoom(),9.5),{duration:.55});
      marker.openPopup();
    }
  },[selectedSlug,boundaryStatus]);

  const focusFarWest=useCallback(()=>{
    setFocusedDistrictKey('all');
    onDistrictChange?.('All');
    if(map.current&&farWestBounds.current?.isValid()){
      map.current.closePopup();
      map.current.flyToBounds(farWestBounds.current,{padding:[28,28],maxZoom:8.5,duration:.6,easeLinearity:.25});
    }
  },[onDistrictChange]);

  const jumpToDistrict=useCallback(districtKey=>{
    if(districtKey==='all'){
      focusFarWest();
      return;
    }
    setFocusedDistrictKey(districtKey);
    const info=ORDERED_DISTRICTS.find(d=>d.key===districtKey);
    if(info)onDistrictChange?.(info.name);
    const bounds=districtBoundsRef.current.get(districtKey);
    const center=districtCenters.current.get(districtKey);
    if(map.current&&bounds?.isValid()){
      map.current.flyToBounds(bounds,{padding:[42,42],maxZoom:10,duration:.6});
    }else if(map.current&&center){
      map.current.flyTo(center,9.5,{duration:.6});
    }
  },[focusFarWest,onDistrictChange]);

  // Keep focusedDistrictKey synced if parent changes activeDistrict
  useEffect(()=>{
    if(!activeDistrict||activeDistrict==='All'){
      setFocusedDistrictKey('all');
    }else{
      const key=normalizeDistrict(activeDistrict);
      setFocusedDistrictKey(key);
    }
  },[activeDistrict]);

  const toggle3D=()=>{
    setIs3D(prev=>{
      const next=!prev;
      localStorage.setItem('heritage-map-3d',next?'1':'0');
      return next;
    });
  };

  const chooseMapStyle=style=>{setMapStyle(style);localStorage.setItem('heritage-map-style',style)};

  const navigableRecords=useMemo(()=>(Array.isArray(filteredEntries)&&filteredEntries.length?filteredEntries:entries),[filteredEntries,entries]);
  const currentRecordIndex=useMemo(()=>{
    const idx=navigableRecords.findIndex(e=>e.slug===selectedSlug);
    return idx>=0?idx:0;
  },[navigableRecords,selectedSlug]);
  const currentRecord=navigableRecords[currentRecordIndex]||entries[0];

  const stepRecord=delta=>{
    if(!navigableRecords.length)return;
    const nextIndex=(currentRecordIndex+delta+navigableRecords.length)%navigableRecords.length;
    onSelect(navigableRecords[nextIndex]);
  };

  const activeDistrictInfo=hoveredDistrict||(currentRecord?{name:currentRecord.district,...getDistrictRelief(currentRecord.district)}:null);

  return <div className={`heritage-map-shell ${is3D?'is-3d-active':'is-2d-flat'}`} data-map-style={mapStyle}>
    <div className="heritage-district-nav" role="navigation" aria-label="District quick navigation">
      <button
        type="button"
        className={focusedDistrictKey==='all'?'active':''}
        onClick={()=>jumpToDistrict('all')}
      >
        <Compass size={12}/>
        <span>All 9 Districts</span>
        <i>{activeDataset.length}</i>
      </button>
      {ORDERED_DISTRICTS.map(d=>{
        const count=districtCounts.get(d.key)||0;
        return <button
          key={d.key}
          type="button"
          className={focusedDistrictKey===d.key?'active':''}
          onClick={()=>jumpToDistrict(d.key)}
          title={`${d.name} · Peak ${d.peak} (${d.landmark}) · ${count} records`}
        >
          <span>{d.name}</span>
          <i>{count}</i>
        </button>;
      })}
    </div>

    <div className="heritage-map-stage">
      <div className="heritage-map-canvas" ref={host} aria-label="OpenStreetMap with Far West 3D district relief and glowing heritage data points" role="application"/>

      <div className="heritage-map-actions">
        <button className="heritage-map-reset far-west-button" type="button" onClick={focusFarWest} disabled={boundaryStatus!=='ready'} title="Reset to full Sudurpashchim view">
          <LocateFixed size={13}/>
          <span>Reset</span>
        </button>
        <button
          className={`heritage-map-3d-toggle ${is3D?'active':''}`}
          type="button"
          aria-pressed={is3D}
          onClick={toggle3D}
          title="Toggle 3D relief depth and perspective"
        >
          <Box size={13}/>
          <span>{is3D?'3D Relief':'2D Flat'}</span>
        </button>
        <button
          className={`heritage-map-3d-toggle ${reliefOverlay?'active':''}`}
          type="button"
          aria-pressed={reliefOverlay}
          onClick={()=>setReliefOverlay(v=>!v)}
          title="Toggle topographic elevation contours"
        >
          <Mountain size={13}/>
          <span>Topo</span>
        </button>
        <button
          className={`heritage-map-3d-toggle ${showAllDbPoints?'active':''}`}
          type="button"
          aria-pressed={showAllDbPoints}
          onClick={()=>setShowAllDbPoints(v=>!v)}
          title="Show all entered & database points on the map"
        >
          <Database size={13}/>
          <span>{loadingDbPoints?'Loading…':showAllDbPoints?`All (${activeDataset.length.toLocaleString()})`:`Points (${activeDataset.length})`}</span>
        </button>
      </div>

      <div className="heritage-map-style-picker" role="group" aria-label="Map style">
        {[
          {id:'street',label:'Street',Icon:MapIcon},
          {id:'light',label:'Light',Icon:Sun},
          {id:'night',label:'Night',Icon:Moon},
          {id:'heritage',label:'Heritage',Icon:Layers},
        ].map(({id,label,Icon})=><button key={id} type="button" className={mapStyle===id?'active':''} aria-pressed={mapStyle===id} onClick={()=>chooseMapStyle(id)} title={`${label} map style`}><Icon size={12}/><span>{label}</span></button>)}
      </div>

      {currentRecord&&<div className="heritage-map-site-dock" aria-label="Active heritage point navigator">
        <button type="button" className="dock-step-btn" onClick={()=>stepRecord(-1)} aria-label="Previous heritage point" title="Previous heritage point">
          <ArrowLeft size={13}/>
        </button>
        <button type="button" className="dock-site-info" onClick={()=>selectRecord(currentRecord)} title="Scroll to full story">
          <span className="dock-kicker">
            <i className="dock-glow-dot"/>
            {currentRecordIndex+1}/{navigableRecords.length} · {currentRecord.district}
          </span>
          <b>{currentRecord.title}</b>
        </button>
        <button type="button" className="dock-step-btn" onClick={()=>stepRecord(1)} aria-label="Next heritage point" title="Next heritage point">
          <ArrowRight size={13}/>
        </button>
      </div>}

      <div className="heritage-map-elevation-card" aria-live="polite">
        <Sparkles size={12}/>
        {activeDistrictInfo
          ?<span><b>{activeDistrictInfo.name}</b> · ▲ {activeDistrictInfo.peak} · {activeDistrictInfo.zone}</span>
          :<span><b>{activeDataset.length.toLocaleString()} Glowing Points</b> · Terai 180m → Api Himal 7,132m</span>}
      </div>

      {boundaryStatus==='loading'&&<div className="heritage-map-message"><span className="map-loading-dot"/> Loading Nepal district boundaries…</div>}
      {boundaryStatus==='unavailable'&&<div className="heritage-map-message map-warning"><MapPin size={14}/> OSM map is available; Nepal district outlines could not be loaded.</div>}
    </div>
  </div>;
}
