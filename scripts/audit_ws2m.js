const {et0Day,dayOfYear}=require('../src/climate.js');
const raw=require('../data/demo/power_-6.03_-76.97.json').raw;
const p=raw.properties.parameter, z=raw.geometry.coordinates[2], lat=-6.034;
const ks=Object.keys(p.T2M).filter(k=>k>='20150101'&&k<='20231231'&&p.WS2M[k]>-900);
// et0Day aplica el piso internamente; replicamos con ws efectivo = valor deseado (>= piso 0.5)
function annual(wsFn){let s=0;for(const k of ks){const y=+k.slice(0,4),m=+k.slice(4,6)-1,d=+k.slice(6);
 s+=et0Day({tmean:p.T2M[k],tmax:p.T2M_MAX[k],tmin:p.T2M_MIN[k],rh:p.RH2M[k],ws:wsFn(p.WS2M[k]),rs:p.ALLSKY_SFC_SW_DWN[k],lat,doy:dayOfYear(new Date(Date.UTC(y,m,d))),z});}
 return s/ks.length*365.25;}
const ws=ks.map(k=>p.WS2M[k]);console.log('WS2M media',(ws.reduce((a,b)=>a+b)/ws.length).toFixed(2),'max',Math.max(...ws).toFixed(2),'n',ws.length);
const base=annual(w=>0.5);
for(const u of [0.5,0.8,1.0,1.5,2.0]){const e=annual(()=>u);console.log('u2 fijo',u,'ET0 anual',e.toFixed(0),'mm',((e/base-1)*100).toFixed(1)+'%');}
console.log('ET0 con WS2M crudo (piso 0.5 aplica):',annual(w=>w).toFixed(0));
