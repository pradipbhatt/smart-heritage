import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, Moon, Sun, Map as MapIcon, Layers } from 'lucide-react';

const districtsUrl='/data/nepal-districts-2020.geojson';
const farWestPointsUrl='/data/sudurpaschim-districts.simplified.geojson';
const tileUrl='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const normalizeDistrict=value=>String(value||'').toLowerCase().replace(/\s*\(regional\)/,'').replace(/[^a-z]/g,'');

function districtRecords(entries){
  const groups=new Map();
  for(const entry of entries){
    const districtKey=normalizeDistrict(entry.district);
    const key=/sudur.*p.*chim|farwest|regional|province/.test(districtKey)?'sudurpaschim':districtKey||'region';
    const group=groups.get(key)||{district:entry.district||'Sudurpashchim',entries:[]};
    group.entries.push(entry);groups.set(key,group);
  }
  return groups;
}

function popupContent(district,entries,onSelect){
  const root=document.createElement('div');root.className='heritage-popup';
  const heading=document.createElement('strong');heading.className='heritage-popup-title';heading.textContent=district;root.append(heading);
  const note=document.createElement('span');note.className='heritage-popup-note';note.textContent=`${entries.length} heritage ${entries.length===1?'record':'records'} · approximate district location`;root.append(note);
  if(normalizeDistrict(district)==='darchula'){
    const context=document.createElement('small');context.className='heritage-popup-more';context.textContent='Kalapani–Lipulekh area is shown according to Nepal’s 2020 political map. The international boundary is disputed.';root.append(context);
  }
  const list=document.createElement('div');list.className='heritage-popup-list';
  entries.slice(0,8).forEach(entry=>{
    const button=document.createElement('button');button.type='button';button.className='heritage-popup-record';
    const title=document.createElement('span');title.textContent=entry.title;
    const category=document.createElement('small');category.textContent=entry.category;
    button.append(title,category);button.addEventListener('click',()=>onSelect(entry));list.append(button);
  });
  root.append(list);
  if(entries.length>8){const remaining=document.createElement('small');remaining.className='heritage-popup-more';remaining.textContent=`Showing 8 of ${entries.length}. Browse all records in the Explorer.`;root.append(remaining)}
  const link=document.createElement('a');link.className='heritage-popup-link';link.href='/explorer';link.textContent='Open heritage explorer →';root.append(link);
  L.DomEvent.disableClickPropagation(root);
  return root;
}

function maskCoordinates(features){
  // Show OSM only through the Far West district shapes; all surrounding regions
  // stay quiet while the shared boundary data retains the Nepal 2020 extent.
  const outer=[[0,50],[0,125],[60,125],[60,50],[0,50]];
  const regionRings=[];
  features.forEach(feature=>{
    const geometry=feature.geometry;
    const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
    polygons.forEach(polygon=>{if(polygon[0])regionRings.push(polygon[0].map(([lon,lat])=>[lat,lon]))});
  });
  return [outer,...regionRings];
}

export default function HeritageMap({entries=[],selectedSlug,onSelect=()=>{}}){
  const host=useRef(null),map=useRef(null),markers=useRef(null),districtCenters=useRef(new Map()),districtMarkers=useRef(new Map()),farWestBounds=useRef(null);
  const [ready,setReady]=useState(false),[boundaryStatus,setBoundaryStatus]=useState('loading');
  const [mapStyle,setMapStyle]=useState(()=>localStorage.getItem('heritage-map-style')||'street');
  const selectRecord=useCallback(entry=>{onSelect(entry);document.getElementById('stories')?.scrollIntoView({behavior:'smooth',block:'start'})},[onSelect]);

  useEffect(()=>{
    if(!host.current)return;
    const instance=L.map(host.current,{scrollWheelZoom:true,wheelDebounceTime:40,wheelPxPerZoomLevel:100,zoomSnap:.5,zoomDelta:.5,zoomControl:false,preferCanvas:true,inertia:true,inertiaDeceleration:2800,inertiaMaxSpeed:1400,easeLinearity:.2,zoomAnimation:true,fadeAnimation:true,markerZoomAnimation:true,minZoom:7,maxZoom:19}).setView([29.25,80.7],7.5);
    instance.createPane('nepal-context-mask');instance.getPane('nepal-context-mask').style.zIndex='450';instance.getPane('nepal-context-mask').style.pointerEvents='none';
    instance.createPane('nepal-districts');instance.getPane('nepal-districts').style.zIndex='460';
    L.tileLayer(tileUrl,{
      minZoom:5,maxZoom:19,keepBuffer:1,updateWhenIdle:true,updateWhenZooming:false,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }).addTo(instance);
    L.control.zoom({position:'topright'}).addTo(instance);
    const markerLayer=L.layerGroup().addTo(instance);
    map.current=instance;markers.current=markerLayer;setReady(true);
    const controller=new AbortController();
    Promise.all([fetch(districtsUrl,{signal:controller.signal}),fetch(farWestPointsUrl,{signal:controller.signal})]).then(async([districtResponse,farWestResponse])=>{
      if(!districtResponse.ok||!farWestResponse.ok)throw new Error('Map data could not be loaded.');
      return Promise.all([districtResponse.json(),farWestResponse.json()]);
    }).then(([districtData,farWestData])=>{
      if(controller.signal.aborted||!Array.isArray(districtData.features))return;
      const farWestFeatures=districtData.features.filter(feature=>feature.properties?.provinceId==='P7');
      const boundaryLayer=L.geoJSON({...districtData,features:farWestFeatures},{
        pane:'nepal-districts',
        style:feature=>{
          const isDarchula=feature.properties?.name==='Darchula';
          return {color:'var(--atlas-accent-strong)',weight:isDarchula?2.5:1.4,opacity:.9,fillColor:'var(--atlas-accent)',fillOpacity:.1};
        },
        onEachFeature(feature,layer){
          const name=feature.properties?.name;if(!name)return;
          const label=name==='Darchula'?'Darchula · Nepal’s 2020 map extent':name;
          layer.bindTooltip(label,{sticky:true,direction:'center',className:'heritage-district-label'});
        },
      });
      const districtLayers=boundaryLayer.getLayers();
      const farWest=boundaryLayer.getBounds();
      const centers=new Map();
      districtLayers.forEach(layer=>{
        const feature=layer.feature;
        const name=feature.properties?.name;if(!name)return;
        centers.set(normalizeDistrict(name),layer.getBounds().getCenter());
      });
      farWestData.features?.forEach(feature=>{
        const name=feature.properties?.name;if(!name)return;
        const lat=Number(feature.properties.center_lat),lon=Number(feature.properties.center_lon);
        if(Number.isFinite(lat)&&Number.isFinite(lon))centers.set(normalizeDistrict(name),L.latLng(lat,lon));
      });
      districtCenters.current=centers;farWestBounds.current=farWest;
      const mapMask=L.polygon(maskCoordinates(farWestFeatures),{
        pane:'nepal-context-mask',stroke:false,fillColor:'var(--atlas-surface)',fillOpacity:1,fillRule:'evenodd',interactive:false,
      }).addTo(instance);
      boundaryLayer.addTo(instance);
      const paddedBounds=farWest.pad(.18);instance.setMaxBounds(paddedBounds);instance.options.maxBoundsViscosity=.92;
      instance.fitBounds(farWest,{padding:[36,36],maxZoom:8.5});
      setBoundaryStatus('ready');
    }).catch(error=>{if(error.name!=='AbortError')setBoundaryStatus('unavailable')});
    return()=>{controller.abort();markers.current?.clearLayers();instance.remove();map.current=null;markers.current=null;setReady(false)};
  },[]);

  useEffect(()=>{
    if(!ready||!map.current||!markers.current||boundaryStatus!=='ready')return;
    const groups=districtRecords(entries);markers.current.clearLayers();districtMarkers.current.clear();
    groups.forEach(({district,entries:groupEntries},key)=>{
      let center=districtCenters.current.get(key);
      if(!center&&key==='sudurpaschim')center=farWestBounds.current?.getCenter();
      if(!center)return;
      const count=groupEntries.length;
      const icon=L.divIcon({className:'heritage-map-marker',html:`<span>${count>99?'99+':count}</span>`,iconSize:[42,42],iconAnchor:[21,21]});
      const marker=L.marker(center,{icon,title:`${district}: ${count} heritage records`,keyboard:true,alt:`${district}, ${count} heritage records`});
      marker.bindPopup(()=>popupContent(district,groupEntries,selectRecord),{maxWidth:310,minWidth:220,autoPanPadding:[22,22]});
      marker.addTo(markers.current);districtMarkers.current.set(key,marker);
    });
  },[entries,ready,boundaryStatus,selectRecord]);

  useEffect(()=>{
    if(!selectedSlug||!map.current)return;
    const selected=entries.find(entry=>entry.slug===selectedSlug);if(!selected)return;
    const key=normalizeDistrict(selected.district),marker=districtMarkers.current.get(key),center=districtCenters.current.get(key);
    if(center){map.current.flyTo(center,Math.max(map.current.getZoom(),9),{duration:.65});marker?.openPopup()}
  },[selectedSlug,entries,boundaryStatus]);

  const focusFarWest=useCallback(()=>{if(map.current&&farWestBounds.current?.isValid())map.current.flyToBounds(farWestBounds.current,{padding:[36,36],maxZoom:8.5,duration:.7,easeLinearity:.2})},[]);
  const chooseMapStyle=style=>{setMapStyle(style);localStorage.setItem('heritage-map-style',style)};

  return <div className="heritage-map-shell" data-map-style={mapStyle}>
    <div className="heritage-map-canvas" ref={host} aria-label="OpenStreetMap with Drishya Far West district data and heritage record markers" role="application"/>
    <div className="heritage-map-actions">
      <button className="heritage-map-reset far-west-button" type="button" onClick={focusFarWest} disabled={boundaryStatus!=='ready'}><LocateFixed size={15}/> Reset Far West</button>
    </div>
    <div className="heritage-map-style-picker" role="group" aria-label="Map style">
      <span><Layers size={14}/> Map style</span>
      {[
        {id:'street',label:'Street',Icon:MapIcon},
        {id:'light',label:'Light',Icon:Sun},
        {id:'night',label:'Night',Icon:Moon},
        {id:'heritage',label:'Heritage',Icon:Layers},
      ].map(({id,label,Icon})=><button key={id} type="button" className={mapStyle===id?'active':''} aria-pressed={mapStyle===id} onClick={()=>chooseMapStyle(id)} title={`${label} map style`}><Icon size={14}/><span>{label}</span></button>)}
    </div>
    {boundaryStatus==='loading'&&<div className="heritage-map-message"><span className="map-loading-dot"/> Loading updated Nepal district boundaries…</div>}
    {boundaryStatus==='unavailable'&&<div className="heritage-map-message map-warning"><MapPin size={14}/> OSM map is available; Nepal district outlines could not be loaded.</div>}
    <div className="heritage-map-privacy"><MapPin size={13}/> Record pins show approximate district locations.</div>
  </div>;
}
