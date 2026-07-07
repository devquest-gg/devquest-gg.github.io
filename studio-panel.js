(function(){
  if (window.__studioPanelInit) return; window.__studioPanelInit = true;
  var esc = (typeof bfEsc==="function") ? bfEsc : function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});};
  var PAL=['#58a6ff','#a371f7','#3fb950','#d29922','#f778ba','#f0883e','#39c5cf','#db61a2'];
  var pad2=function(n){return ('0'+n).slice(-2);};

  var SP_CSS = `
.sp-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .18s;z-index:9000}
body.sp-open .sp-scrim{opacity:1;pointer-events:auto}
#sp-drawer{position:fixed;top:0;right:0;height:100vh;height:100dvh;width:440px;max-width:92vw;background:var(--bg);border-left:1px solid var(--border);transform:translateX(100%);transition:transform .22s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-16px 0 40px rgba(0,0,0,.5);z-index:9001}
body.sp-open #sp-drawer{transform:translateX(0)}
.sp-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 12px 10px 16px;border-bottom:1px solid var(--border);flex:0 0 auto}
.sp-k{font-size:11px;font-weight:800;letter-spacing:.05em;color:var(--muted);text-transform:uppercase}
.sp-x{background:none;border:1px solid var(--border);color:var(--muted);border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer}
.sp-x:hover{color:var(--text);border-color:var(--accent)}
#sp-scroll{overflow-y:auto;flex:1 1 auto;-webkit-overflow-scrolling:touch}
.sphead{padding:16px 16px 12px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(88,166,255,.06),transparent)}
.spcrumb{font-size:10.5px;font-weight:800;letter-spacing:.06em;color:var(--muted)}
.sptrow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:3px}
.sptrow h2{font-size:18px;margin:0}
.spfollow{background:var(--panel);border:1px solid var(--border);color:var(--muted);border-radius:999px;padding:5px 11px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.spfollow.on{color:var(--gold);border-color:var(--gold)}
.spparent{font-size:12px;color:var(--muted);margin-top:6px}
.spbody{padding:14px 16px 40px}
.spstats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.spstat{flex:1 1 84px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:9px 11px}
.spstat b{display:block;font-size:19px;font-weight:800;line-height:1.1}.spstat span{font-size:11px;color:var(--muted)}
.spup{color:var(--green)}.spdown{color:var(--pink)}.spflat{color:var(--muted)}
.spmom{font-size:12.5px;color:var(--muted);border-left:3px solid var(--border);padding:6px 10px;border-radius:4px;background:var(--panel);margin-bottom:6px}
.spmom.spup{border-color:var(--green)}.spmom.spdown{border-color:var(--pink)}
.spsec{margin-top:16px}.spsech{font-size:11.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.spnote{font-weight:600;text-transform:none;letter-spacing:0;color:#8b7a3a;font-size:10.5px;margin-left:6px}
.spsal{font-size:13px}.spsal b{color:var(--green)}
.sp-chart{display:flex;align-items:flex-end;gap:5px;height:80px;padding:6px 2px 0}
.sp-cbar{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;justify-content:flex-end;min-width:0}
.sp-cb{width:100%;max-width:22px;background:linear-gradient(180deg,#a371f7,rgba(163,113,247,.28));border-radius:3px 3px 0 0}
.sp-cx{font-size:8.5px;color:var(--muted);white-space:nowrap}
.spbrow{display:flex;align-items:center;gap:9px;margin-bottom:6px}
.spblab{font-size:12px;width:120px;flex:0 0 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.spbtrack{flex:1;height:8px;background:var(--panel2,#1b222c);border-radius:999px;overflow:hidden}.spbfill{display:block;height:100%;border-radius:999px}
.spbval{font-size:11.5px;color:var(--muted);width:26px;text-align:right}
.splocwrap{display:flex;flex-wrap:wrap;gap:7px}
.sploc{font-size:11.5px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:3px 10px;cursor:pointer;background:none;font-family:inherit}
.sploc:hover{border-color:var(--accent)}.sploc b{color:var(--accent);margin-left:3px;font-weight:700}
.sploc.on{color:var(--text);border-color:var(--accent);background:rgba(88,166,255,.12)}
.sprolehead{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:9px}
.sprolehead .spsech{margin:0}
.splocclear{background:none;border:1px solid var(--border);color:var(--accent);border-radius:999px;padding:2px 9px;font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap}
.splocclear:hover{border-color:var(--accent)}
.sproles{border:1px solid var(--border);border-radius:10px;overflow:hidden}
.sprole{padding:11px 13px;border-bottom:1px solid var(--border)}.sprole:last-child{border-bottom:none}
.sprttl{font-size:13.5px;font-weight:600;color:var(--text);text-decoration:none}a.sprttl:hover{color:var(--accent);text-decoration:underline}
.sprtags{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}.sprtag{font-size:11px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:1px 8px}.sprtag.sal{color:var(--green);border-color:rgba(63,185,80,.5)}
.sprmeta{font-size:11.5px}.spfresh{color:var(--green)}.spagemid{color:var(--muted)}.spstale{color:var(--gold)}.sprelist{color:var(--pink);font-weight:600}
.studio[data-tip]{cursor:pointer}.studio[data-tip]:hover{text-decoration:underline}
#gridTip .gtcta{margin-top:8px;padding-top:7px;border-top:1px solid var(--border);color:var(--accent);font-size:11.5px;font-weight:600}
@media(max-width:640px){#sp-drawer{width:100vw;max-width:100vw;transform:translateY(100%)}body.sp-open #sp-drawer{transform:translateY(0)}.spblab{width:96px}}
`;

  function parseSal(s){ if(!s) return null; var m=String(s).match(/\$(\d+)\s*[kK][^\d]+\$?(\d+)\s*[kK]/); if(!m) return null; var lo=+m[1],hi=+m[2]; if(!lo||!hi) return null; return [lo,hi]; }

  function monthSeries(roles){
    var mk={};
    roles.forEach(function(j){ var t=j.fseen||0; if(!t) return; var d=new Date(t); mk[d.getFullYear()+'-'+pad2(d.getMonth()+1)]=(mk[d.getFullYear()+'-'+pad2(d.getMonth()+1)]||0)+1; });
    var out=[], now=new Date();
    for(var i=11;i>=0;i--){ var d=new Date(now.getFullYear(), now.getMonth()-i, 1); var key=d.getFullYear()+'-'+pad2(d.getMonth()+1); out.push({m:key,c:mk[key]||0}); }
    while(out.length>1 && out[0].c===0) out.shift();   // trim leading empty months — grows as history accrues
    return out;
  }

  function profile(name){
    var raw = (typeof JOBS!=="undefined"?JOBS:[]).filter(function(j){return j.s===name;});
    var open = raw.length, now=Date.now();
    var remote = raw.filter(function(j){return j.w==="Remote";}).length;
    var newWk = raw.filter(function(j){return (j.fseen||j.ts||0) >= now-7*864e5;}).length;
    var sals = raw.map(function(j){return parseSal(j.salary);}).filter(Boolean);
    function grp(f){ var m={}; raw.forEach(function(j){var k=f(j)||"Unknown"; m[k]=(m[k]||0)+1;}); return Object.keys(m).map(function(k){return [k,m[k]];}).sort(function(a,b){return b[1]-a[1];}); }
    var meta; try{ meta=studioMeta(name);}catch(e){ meta={cities:[],various:false,parent:null}; }
    var mom=0; try{ mom=bfMomentum(name)||0; }catch(e){}
    var roles = raw.map(function(j){
      var locs=[]; try{ var jc=jobCities(j); locs = jc.various?[]:(jc.cities||[]); }catch(e){ if(j.l) locs=[j.l]; }
      var city = locs.length?locs[0]:( (function(){try{return jobCities(j).various;}catch(e){return false;}})()?"Multiple locations":(j.l||"") );
      return { t:j.t, d:j.d, sen:j.sen, w:j.w, city:city, locs:locs, sal:parseSal(j.salary)?j.salary:null, yoe:j.yoe,
        days:(typeof daysListed==="function"?daysListed(j):null), rel:(typeof relistedNow==="function"?relistedNow(j):!!j.relisted), relCount:j.relistCount||0, url:j.url };
    }).sort(function(a,b){ return (a.days==null?1e9:a.days)-(b.days==null?1e9:b.days); });
    var lc={}; roles.forEach(function(r){ r.locs.forEach(function(c){ lc[c]=(lc[c]||0)+1; }); });
    var locs = Object.keys(lc).map(function(k){return [k,lc[k]];}).sort(function(a,b){return b[1]-a[1];});
    return { name:name, parent:meta.parent, open:open, mom:mom, remotePct: open?Math.round(100*remote/open):0, newWk:newWk,
      salCount:sals.length, salMin:sals.length?Math.min.apply(null,sals.map(function(x){return x[0];})):null, salMax:sals.length?Math.max.apply(null,sals.map(function(x){return x[1];})):null,
      disc:grp(function(j){return j.d;}), sen:grp(function(j){return j.sen;}), locs:locs, various:meta.various,
      months:monthSeries(raw), roles:roles };
  }

  function chart(months){
    if(!months.length || !months.some(function(m){return m.c>0;})) return '';
    var max=Math.max.apply(null,months.map(function(m){return m.c;}).concat([1]));
    return '<div class="sp-chart">'+months.map(function(m){
      var h=Math.max(3,Math.round(58*m.c/max));
      return '<div class="sp-cbar" title="'+m.m+': '+m.c+' new"><span class="sp-cb" style="height:'+h+'px"></span><span class="sp-cx">'+(m.m.slice(5)+'/'+m.m.slice(2,4))+'</span></div>';
    }).join('')+'</div>';
  }

  function barRow(label,val,max,color){ var w=Math.max(2,Math.round(100*val/(max||1))); return '<div class="spbrow"><span class="spblab">'+esc(label)+'</span><span class="spbtrack"><span class="spbfill" style="width:'+w+'%;background:'+color+'"></span></span><span class="spbval">'+val+'</span></div>'; }

  function roleRow(r){
    var age = r.days==null?'' : r.days<=2?'<span class="spfresh">Listed '+(r.days===0?'today':r.days+'d ago')+'</span>' : r.days>=60?'<span class="spstale">Listed '+r.days+'d ago</span>' : '<span class="spagemid">Listed '+r.days+'d ago</span>';
    var rel = r.rel?' <span class="sprelist">&#8635; re-listed'+(r.relCount>1?' '+r.relCount+'×':'')+'</span>':'';
    var tags=[r.d,r.sen,(r.w&&r.w!=="Unknown"?r.w:null),r.city].filter(Boolean).map(function(t){return '<span class="sprtag">'+esc(t)+'</span>';}).join('');
    var sal=r.sal?'<span class="sprtag sal">'+esc(r.sal)+'</span>':'';
    var yoe=r.yoe?'<span class="sprtag">'+r.yoe+'+ yrs</span>':'';
    var ttl=r.url?'<a class="sprttl" href="'+esc(r.url)+'" target="_blank" rel="noopener">'+esc(r.t)+' ↗</a>':'<span class="sprttl">'+esc(r.t)+'</span>';
    return '<div class="sprole">'+ttl+'<div class="sprtags">'+tags+sal+yoe+'</div><div class="sprmeta">'+age+rel+'</div></div>';
  }

  function panelHtml(name){
    var s=profile(name); if(!s.open) return '<div style="padding:20px;color:var(--muted)">No open roles tracked for '+esc(name)+' right now.</div>';
    var isF=false; try{isF=isFollowed(name);}catch(e){}
    var momUp=s.mom>0, momFlat=s.mom===0;
    var discMax=Math.max.apply(null,s.disc.map(function(d){return d[1];}).concat([1]));
    var senMax=Math.max.apply(null,s.sen.map(function(d){return d[1];}).concat([1]));
    var salLine = s.salCount>0 ? '<b>$'+s.salMin+'k–$'+s.salMax+'k</b> · '+s.salCount+' of '+s.open+' roles list pay' : 'Only '+s.salCount+' of '+s.open+' roles list pay so far';
    var chartHtml = chart(s.months);
    var locHtml = (s.various?'<button class="sploc" disabled style="cursor:default">Multiple locations</button>':'') + s.locs.slice(0,10).map(function(l){
      return '<button class="sploc'+(curLoc&&curLoc.toLowerCase()===l[0].toLowerCase()?' on':'')+'" data-loc="'+esc(l[0]).replace(/"/g,'&quot;')+'">'+esc(l[0])+' <b>'+l[1]+'</b></button>';
    }).join('');
    // roles list, optionally filtered by a clicked location
    var shown = curLoc ? s.roles.filter(function(r){ return r.locs.some(function(c){return c.toLowerCase()===curLoc.toLowerCase();}); }) : s.roles;
    var rolesHead = curLoc
      ? '<div class="spsech" style="margin:0">'+shown.length+' role'+(shown.length===1?'':'s')+' in 📍 '+esc(curLoc)+'</div><button class="splocclear" data-loc-clear="1">✕ clear</button>'
      : '<div class="spsech" style="margin:0">All '+s.open+' open roles</div>';
    return ''
    +'<div class="sphead"><div class="spcrumb">STUDIO</div>'
    +'<div class="sptrow"><h2>'+esc(name)+'</h2><button class="spfollow'+(isF?' on':'')+'" data-follow="'+esc(name).replace(/"/g,'&quot;')+'">'+(isF?'★ Following':'☆ Follow')+'</button></div>'
    +(s.parent&&name.indexOf(s.parent)<0?'<div class="spparent">🏢 Part of <b>'+esc(s.parent)+'</b></div>':'')+'</div>'
    +'<div class="spbody">'
    +'<div class="spstats">'
    +'<div class="spstat"><b>'+s.open+'</b><span>open roles</span></div>'
    +'<div class="spstat"><b class="'+(momFlat?'spflat':(momUp?'spup':'spdown'))+'">'+(momFlat?'—':(momUp?'+'+s.mom:s.mom))+'</b><span>vs last month</span></div>'
    +'<div class="spstat"><b>'+s.remotePct+'%</b><span>remote</span></div>'
    +'<div class="spstat"><b class="spup">+'+s.newWk+'</b><span>new this week</span></div>'
    +'</div>'
    +(momFlat?'':'<div class="spmom '+(momUp?'spup':'spdown')+'">Hiring is <b>'+(momUp?'up':'cooling')+'</b> this month vs last · momentum, not news.</div>')
    +(chartHtml?'<div class="spsec"><div class="spsech">When these roles were posted <span class="spnote">original posting month · last 12 mo</span></div>'+chartHtml+'</div>':'')
    +'<div class="spsec"><div class="spsech">Salary transparency</div><div class="spsal">'+salLine+'</div></div>'
    +'<div class="spsec"><div class="spsech">Disciplines hiring</div>'+s.disc.slice(0,8).map(function(d,i){return barRow(d[0],d[1],discMax,PAL[i%PAL.length]);}).join('')+'</div>'
    +'<div class="spsec"><div class="spsech">Seniority mix</div>'+s.sen.map(function(d){return barRow(d[0],d[1],senMax,'#3fb950');}).join('')+'</div>'
    +(locHtml?'<div class="spsec"><div class="spsech">Where they’re hiring <span class="spnote">click a city to filter roles below</span></div><div class="splocwrap">'+locHtml+'</div></div>':'')
    +'<div class="spsec"><div class="sprolehead">'+rolesHead+'</div><div class="sproles">'+(shown.length?shown.map(roleRow).join(''):'<div class="sprole" style="color:var(--muted)">No roles match this location.</div>')+'</div></div>'
    +'</div>';
  }

  var style=document.createElement('style'); style.textContent=SP_CSS; document.head.appendChild(style);
  var scrim=document.createElement('div'); scrim.className='sp-scrim';
  var drawer=document.createElement('aside'); drawer.id='sp-drawer'; drawer.setAttribute('role','dialog'); drawer.setAttribute('aria-modal','true'); drawer.setAttribute('aria-label','Studio details'); drawer.setAttribute('aria-hidden','true');
  drawer.innerHTML='<div class="sp-bar"><span class="sp-k">Studio snapshot</span><button class="sp-x" aria-label="Close">✕</button></div><div id="sp-scroll"></div>';
  document.body.appendChild(scrim); document.body.appendChild(drawer);
  var scrollEl=drawer.querySelector('#sp-scroll'), lastFocus=null, curName=null, curLoc=null;

  function rerender(){ var st=scrollEl.scrollTop; scrollEl.innerHTML=panelHtml(curName); scrollEl.scrollTop=st; }
  function openP(name){ if(!name) return; curName=name; curLoc=null; scrollEl.innerHTML=panelHtml(name); scrollEl.scrollTop=0; lastFocus=document.activeElement; document.body.classList.add('sp-open'); drawer.setAttribute('aria-hidden','false'); try{ window.dqTrack && window.dqTrack("studio_panel_open",{st:name}); }catch(e){} }
  function closeP(){ document.body.classList.remove('sp-open'); drawer.setAttribute('aria-hidden','true'); try{lastFocus&&lastFocus.focus&&lastFocus.focus();}catch(e){} }
  window.openStudioPanel=openP; window.closeStudioPanel=closeP;

  scrim.addEventListener('click',closeP);
  drawer.querySelector('.sp-x').addEventListener('click',closeP);
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&document.body.classList.contains('sp-open')) closeP(); });
  drawer.addEventListener('click',function(e){
    var f=e.target.closest('[data-follow]'); if(f){ try{toggleFollow(f.getAttribute('data-follow'),e);}catch(err){} rerender(); return; }
    var lc=e.target.closest('[data-loc]'); if(lc && !lc.disabled){ var L=lc.getAttribute('data-loc'); curLoc=(curLoc&&curLoc.toLowerCase()===L.toLowerCase())?null:L; rerender(); return; }
    var clr=e.target.closest('[data-loc-clear]'); if(clr){ curLoc=null; rerender(); return; }
  });
  document.addEventListener('click',function(e){
    var el=e.target.closest('[data-studio-open]'), name;
    if(el){ name=el.getAttribute('data-studio-open'); }
    else { var sp=e.target.closest('.studio[data-tip]'); if(sp && !e.target.closest('.cardstar')){ name=(sp.textContent||'').trim(); } }
    if(name){ e.preventDefault(); e.stopPropagation(); openP(name); }
  }, true);
})();
