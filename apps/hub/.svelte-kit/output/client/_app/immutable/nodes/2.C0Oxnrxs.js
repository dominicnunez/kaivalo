import{b as ft,a as S,f as L,c as Q,d as ut,t as Pe}from"../chunks/BpUr5NOx.js";import{ab as Ie,h as E,I as U,a1 as $e,a as oe,D as xe,b as ze,t as T,F as ct,H as dt,G as Le,J as F,f as W,ac as Ge,aE as vt,an as Oe,c as gt,e as ue,s as mt,aM as Ye,a0 as ht,aN as qe,aC as Me,aO as _t,L as He,aP as bt,aQ as pt,aI as xt,aR as D,r as Je,p as Xe,aS as Ee,aT as yt,aU as wt,aB as At,d as ye,ay as ke,aV as Et,E as Ct,aW as Nt,K as kt,aX as Ze,aY as Tt,aZ as Qe,aG as et,a_ as St,a$ as It,b0 as $t,b1 as zt,b2 as Mt,b3 as Pt,b4 as Lt,b5 as Ot,b6 as Ht,y as ee,g as I,b7 as ce,i as k,A as B,B as te,aL as G,z as R,C as N,v as q,k as Ve,b8 as Vt,b9 as Bt,ao as re,ba as Rt}from"../chunks/C6M8wlf6.js";import{i as Dt,a as Ft,c as jt,d as tt,n as Kt,b as Wt,s as fe}from"../chunks/BaH0bhBs.js";import{p as z,i as pe,l as J,s as we,c as Ut}from"../chunks/0IfavMJz.js";import{s as de}from"../chunks/ncXHou-P.js";import{i as Gt}from"../chunks/CsGHj3GC.js";import{B as Yt}from"../chunks/C9T96AC2.js";function qt(e,t){if(t){const a=document.body;e.autofocus=!0,Ie(()=>{document.activeElement===a&&e.focus()})}}let Be=!1;function Jt(){Be||(Be=!0,document.addEventListener("reset",e=>{Promise.resolve().then(()=>{var t;if(!e.defaultPrevented)for(const a of e.target.elements)(t=a.__on_r)==null||t.call(a)})},{capture:!0}))}function at(e,t){return t}function Xt(e,t,a){for(var r=[],i=t.length,s,n=t.length,l=0;l<i;l++){let b=t[l];Xe(b,()=>{if(s){if(s.pending.delete(b),s.done.add(b),s.pending.size===0){var d=e.outrogroups;Te(Me(s.done)),d.delete(s),d.size===0&&(e.outrogroups=null)}}else n-=1},!1)}if(n===0){var c=r.length===0&&a!==null;if(c){var v=a,f=v.parentNode;At(f),f.append(v),e.items.clear()}Te(t,!c)}else s={pending:new Set(t),done:new Set},(e.outrogroups??(e.outrogroups=new Set)).add(s)}function Te(e,t=!0){for(var a=0;a<e.length;a++)ye(e[a],t)}var Re;function rt(e,t,a,r,i,s=null){var n=e,l=new Map,c=(t&Ye)!==0;if(c){var v=e;n=E?U($e(v)):v.appendChild(oe())}E&&xe();var f=null,b=ht(()=>{var u=a();return qe(u)?u:u==null?[]:Me(u)}),d,m=!0;function w(){o.fallback=f,Zt(o,d,n,t,r),f!==null&&(d.length===0?(f.f&D)===0?Je(f):(f.f^=D,le(f,null,n)):Xe(f,()=>{f=null}))}var p=ze(()=>{d=T(b);var u=d.length;let x=!1;if(E){var C=ct(n)===dt;C!==(u===0)&&(n=Le(),U(n),F(!1),x=!0)}for(var _=new Set,$=gt,h=mt(),g=0;g<u;g+=1){E&&W.nodeType===Ge&&W.data===vt&&(n=W,x=!0,F(!1));var A=d[g],M=r(A,g),y=m?null:l.get(M);y?(y.v&&Oe(y.v,A),y.i&&Oe(y.i,g),h&&$.skipped_effects.delete(y.e)):(y=Qt(l,m?n:Re??(Re=oe()),A,M,g,i,t,a),m||(y.e.f|=D),l.set(M,y)),_.add(M)}if(u===0&&s&&!f&&(m?f=ue(()=>s(n)):(f=ue(()=>s(Re??(Re=oe()))),f.f|=D)),E&&u>0&&U(Le()),!m)if(h){for(const[H,j]of l)_.has(H)||$.skipped_effects.add(j.e);$.oncommit(w),$.ondiscard(()=>{})}else w();x&&F(!0),T(b)}),o={effect:p,items:l,outrogroups:null,fallback:f};m=!1,E&&(n=W)}function ie(e){for(;e!==null&&(e.f&yt)===0;)e=e.next;return e}function Zt(e,t,a,r,i){var y,H,j,ge,Y,me,he,_e,V;var s=(r&wt)!==0,n=t.length,l=e.items,c=ie(e.effect.first),v,f=null,b,d=[],m=[],w,p,o,u;if(s)for(u=0;u<n;u+=1)w=t[u],p=i(w,u),o=l.get(p).e,(o.f&D)===0&&((H=(y=o.nodes)==null?void 0:y.a)==null||H.measure(),(b??(b=new Set)).add(o));for(u=0;u<n;u+=1){if(w=t[u],p=i(w,u),o=l.get(p).e,e.outrogroups!==null)for(const O of e.outrogroups)O.pending.delete(o),O.done.delete(o);if((o.f&D)!==0)if(o.f^=D,o===c)le(o,null,a);else{var x=f?f.next:c;o===e.effect.last&&(e.effect.last=o.prev),o.prev&&(o.prev.next=o.next),o.next&&(o.next.prev=o.prev),K(e,f,o),K(e,o,x),le(o,x,a),f=o,d=[],m=[],c=ie(f.next);continue}if((o.f&Ee)!==0&&(Je(o),s&&((ge=(j=o.nodes)==null?void 0:j.a)==null||ge.unfix(),(b??(b=new Set)).delete(o))),o!==c){if(v!==void 0&&v.has(o)){if(d.length<m.length){var C=m[0],_;f=C.prev;var $=d[0],h=d[d.length-1];for(_=0;_<d.length;_+=1)le(d[_],C,a);for(_=0;_<m.length;_+=1)v.delete(m[_]);K(e,$.prev,h.next),K(e,f,$),K(e,h,C),c=C,f=h,u-=1,d=[],m=[]}else v.delete(o),le(o,c,a),K(e,o.prev,o.next),K(e,o,f===null?e.effect.first:f.next),K(e,f,o),f=o;continue}for(d=[],m=[];c!==null&&c!==o;)(v??(v=new Set)).add(c),m.push(c),c=ie(c.next);if(c===null)continue}(o.f&D)===0&&d.push(o),f=o,c=ie(o.next)}if(e.outrogroups!==null){for(const O of e.outrogroups)O.pending.size===0&&(Te(Me(O.done)),(Y=e.outrogroups)==null||Y.delete(O));e.outrogroups.size===0&&(e.outrogroups=null)}if(c!==null||v!==void 0){var g=[];if(v!==void 0)for(o of v)(o.f&Ee)===0&&g.push(o);for(;c!==null;)(c.f&Ee)===0&&c!==e.fallback&&g.push(c),c=ie(c.next);var A=g.length;if(A>0){var M=(r&Ye)!==0&&n===0?a:null;if(s){for(u=0;u<A;u+=1)(he=(me=g[u].nodes)==null?void 0:me.a)==null||he.measure();for(u=0;u<A;u+=1)(V=(_e=g[u].nodes)==null?void 0:_e.a)==null||V.fix()}Xt(e,g,M)}}s&&Ie(()=>{var O,ae;if(b!==void 0)for(o of b)(ae=(O=o.nodes)==null?void 0:O.a)==null||ae.apply()})}function Qt(e,t,a,r,i,s,n,l){var c=(n&bt)!==0?(n&pt)===0?xt(a,!1,!1):He(a):null,v=(n&_t)!==0?He(i):null;return{v:c,i:v,e:ue(()=>(s(t,c??a,v??i,l),()=>{e.delete(r)}))}}function le(e,t,a){if(e.nodes)for(var r=e.nodes.start,i=e.nodes.end,s=t&&(t.f&D)===0?t.nodes.start:a;r!==null;){var n=ke(r);if(s.before(r),r===i)return;r=n}}function K(e,t,a){t===null?e.effect.first=a:t.next=a,a===null?e.effect.last=t:a.prev=t}function ve(e,t,a,r,i){var l;E&&xe();var s=(l=t.$$slots)==null?void 0:l[a],n=!1;s===!0&&(s=t.children,n=!0),s===void 0||s(e,n?()=>r:r)}function ea(e,t,a,r,i,s){let n=E;E&&xe();var l=null;E&&W.nodeType===Et&&(l=W,xe());var c=E?W:e,v=new Yt(c,!1);ze(()=>{const f=t()||null;var b=Nt;if(f===null){v.ensure(null,null);return}return v.ensure(f,d=>{if(f){if(l=E?l:document.createElementNS(b,f),ft(l,l),r){E&&Dt(f)&&l.append(document.createComment(""));var m=E?$e(l):l.appendChild(oe());E&&(m===null?F(!1):U(m)),r(l,m)}kt.nodes.end=l,d.before(l)}E&&U(d)}),()=>{}},Ct),Ze(()=>{}),n&&(F(!0),U(c))}function ta(e,t){let a=null,r=E;var i;if(E){a=W;for(var s=$e(document.head);s!==null&&(s.nodeType!==Ge||s.data!==e);)s=ke(s);if(s===null)F(!1);else{var n=ke(s);s.remove(),U(n)}}E||(i=document.head.appendChild(oe()));try{ze(()=>t(i),Tt)}finally{r&&(F(!0),U(a))}}function aa(e,t){var a=void 0,r;Qe(()=>{a!==(a=t())&&(r&&(ye(r),r=null),a&&(r=ue(()=>{et(()=>a(e))})))})}function it(e){var t,a,r="";if(typeof e=="string"||typeof e=="number")r+=e;else if(typeof e=="object")if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(a=it(e[t]))&&(r&&(r+=" "),r+=a)}else for(a in e)e[a]&&(r&&(r+=" "),r+=a);return r}function ra(){for(var e,t,a=0,r="",i=arguments.length;a<i;a++)(e=arguments[a])&&(t=it(e))&&(r&&(r+=" "),r+=t);return r}function X(e){return typeof e=="object"?ra(e):e??""}const De=[...` 	
\r\f \v\uFEFF`];function ia(e,t,a){var r=e==null?"":""+e;if(a){for(var i in a)if(a[i])r=r?r+" "+i:i;else if(r.length)for(var s=i.length,n=0;(n=r.indexOf(i,n))>=0;){var l=n+s;(n===0||De.includes(r[n-1]))&&(l===r.length||De.includes(r[l]))?r=(n===0?"":r.substring(0,n))+r.substring(l+1):n=l}}return r===""?null:r}function Fe(e,t=!1){var a=t?" !important;":";",r="";for(var i in e){var s=e[i];s!=null&&s!==""&&(r+=" "+i+": "+s+a)}return r}function Ce(e){return e[0]!=="-"||e[1]!=="-"?e.toLowerCase():e}function sa(e,t){if(t){var a="",r,i;if(Array.isArray(t)?(r=t[0],i=t[1]):r=t,e){e=String(e).replaceAll(/\s*\/\*.*?\*\/\s*/g,"").trim();var s=!1,n=0,l=!1,c=[];r&&c.push(...Object.keys(r).map(Ce)),i&&c.push(...Object.keys(i).map(Ce));var v=0,f=-1;const p=e.length;for(var b=0;b<p;b++){var d=e[b];if(l?d==="/"&&e[b-1]==="*"&&(l=!1):s?s===d&&(s=!1):d==="/"&&e[b+1]==="*"?l=!0:d==='"'||d==="'"?s=d:d==="("?n++:d===")"&&n--,!l&&s===!1&&n===0){if(d===":"&&f===-1)f=b;else if(d===";"||b===p-1){if(f!==-1){var m=Ce(e.substring(v,f).trim());if(!c.includes(m)){d!==";"&&b++;var w=e.substring(v,b).trim();a+=" "+w+";"}}v=b+1,f=-1}}}}return r&&(a+=Fe(r)),i&&(a+=Fe(i,!0)),a=a.trim(),a===""?null:a}return e==null?null:String(e)}function Z(e,t,a,r,i,s){var n=e.__className;if(E||n!==a||n===void 0){var l=ia(a,r,s);(!E||l!==e.getAttribute("class"))&&(l==null?e.removeAttribute("class"):t?e.className=l:e.setAttribute("class",l)),e.__className=a}else if(s&&i!==s)for(var c in s){var v=!!s[c];(i==null||v!==!!i[c])&&e.classList.toggle(c,v)}return s}function Ne(e,t={},a,r){for(var i in a){var s=a[i];t[i]!==s&&(a[i]==null?e.style.removeProperty(i):e.style.setProperty(i,s,r))}}function na(e,t,a,r){var i=e.__style;if(E||i!==t){var s=sa(t,r);(!E||s!==e.getAttribute("style"))&&(s==null?e.removeAttribute("style"):e.style.cssText=s),e.__style=t}else r&&(Array.isArray(r)?(Ne(e,a==null?void 0:a[0],r[0]),Ne(e,a==null?void 0:a[1],r[1],"important")):Ne(e,a,r));return r}function Se(e,t,a=!1){if(e.multiple){if(t==null)return;if(!qe(t))return St();for(var r of e.options)r.selected=t.includes(je(r));return}for(r of e.options){var i=je(r);if(It(i,t)){r.selected=!0;return}}(!a||t!==void 0)&&(e.selectedIndex=-1)}function la(e){var t=new MutationObserver(()=>{Se(e,e.__value)});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["value"]}),Ze(()=>{t.disconnect()})}function je(e){return"__value"in e?e.__value:e.value}const se=Symbol("class"),ne=Symbol("style"),st=Symbol("is custom element"),nt=Symbol("is html");function oa(e){if(E){var t=!1,a=()=>{if(!t){if(t=!0,e.hasAttribute("value")){var r=e.value;P(e,"value",null),e.value=r}if(e.hasAttribute("checked")){var i=e.checked;P(e,"checked",null),e.checked=i}}};e.__on_r=a,Ie(a),Jt()}}function fa(e,t){t?e.hasAttribute("selected")||e.setAttribute("selected",""):e.removeAttribute("selected")}function P(e,t,a,r){var i=lt(e);E&&(i[t]=e.getAttribute(t),t==="src"||t==="srcset"||t==="href"&&e.nodeName==="LINK")||i[t]!==(i[t]=a)&&(t==="loading"&&(e[Ot]=a),a==null?e.removeAttribute(t):typeof a!="string"&&ot(e).includes(t)?e[t]=a:e.setAttribute(t,a))}function ua(e,t,a,r,i=!1,s=!1){if(E&&i&&e.tagName==="INPUT"){var n=e,l=n.type==="checkbox"?"defaultChecked":"defaultValue";l in a||oa(n)}var c=lt(e),v=c[st],f=!c[nt];let b=E&&v;b&&F(!1);var d=t||{},m=e.tagName==="OPTION";for(var w in t)w in a||(a[w]=null);a.class?a.class=X(a.class):a[se]&&(a.class=null),a[ne]&&(a.style??(a.style=null));var p=ot(e);for(const h in a){let g=a[h];if(m&&h==="value"&&g==null){e.value=e.__value="",d[h]=g;continue}if(h==="class"){var o=e.namespaceURI==="http://www.w3.org/1999/xhtml";Z(e,o,g,r,t==null?void 0:t[se],a[se]),d[h]=g,d[se]=a[se];continue}if(h==="style"){na(e,g,t==null?void 0:t[ne],a[ne]),d[h]=g,d[ne]=a[ne];continue}var u=d[h];if(!(g===u&&!(g===void 0&&e.hasAttribute(h)))){d[h]=g;var x=h[0]+h[1];if(x!=="$$")if(x==="on"){const A={},M="$$"+h;let y=h.slice(2);var C=Wt(y);if(Ft(y)&&(y=y.slice(0,-7),A.capture=!0),!C&&u){if(g!=null)continue;e.removeEventListener(y,d[M],A),d[M]=null}if(g!=null)if(C)e[`__${y}`]=g,tt([y]);else{let H=function(j){d[h].call(this,j)};d[M]=jt(y,e,H,A)}else C&&(e[`__${y}`]=void 0)}else if(h==="style")P(e,h,g);else if(h==="autofocus")qt(e,!!g);else if(!v&&(h==="__value"||h==="value"&&g!=null))e.value=e.__value=g;else if(h==="selected"&&m)fa(e,g);else{var _=h;f||(_=Kt(_));var $=_==="defaultValue"||_==="defaultChecked";if(g==null&&!v&&!$)if(c[h]=null,_==="value"||_==="checked"){let A=e;const M=t===void 0;if(_==="value"){let y=A.defaultValue;A.removeAttribute(_),A.defaultValue=y,A.value=A.__value=M?y:null}else{let y=A.defaultChecked;A.removeAttribute(_),A.defaultChecked=y,A.checked=M?y:!1}}else e.removeAttribute(h);else $||p.includes(_)&&(v||typeof g!="string")?(e[_]=g,_ in c&&(c[_]=Lt)):typeof g!="function"&&P(e,_,g)}}}return b&&F(!0),d}function Ke(e,t,a=[],r=[],i=[],s,n=!1,l=!1){$t(i,a,r,c=>{var v=void 0,f={},b=e.nodeName==="SELECT",d=!1;if(Qe(()=>{var w=t(...c.map(T)),p=ua(e,v,w,s,n,l);d&&b&&"value"in w&&Se(e,w.value);for(let u of Object.getOwnPropertySymbols(f))w[u]||ye(f[u]);for(let u of Object.getOwnPropertySymbols(w)){var o=w[u];u.description===zt&&(!v||o!==v[u])&&(f[u]&&ye(f[u]),f[u]=ue(()=>aa(e,()=>o))),p[u]=o}v=p}),b){var m=e;et(()=>{Se(m,v.value,!0),la(m)})}d=!0})}function lt(e){return e.__attributes??(e.__attributes={[st]:e.nodeName.includes("-"),[nt]:e.namespaceURI===Mt})}var We=new Map;function ot(e){var t=e.getAttribute("is")||e.nodeName,a=We.get(t);if(a)return a;We.set(t,a=[]);for(var r,i=e,s=Element.prototype;s!==i;){r=Ht(i);for(var n in r)r[n].set&&a.push(n);i=Pt(i)}return a}const ca=()=>({meta:{title:"Kai Valo | AI Tools That Actually Help",description:"Practical AI tools built by Kai Valo. No hype, just utility. Decode mechanic speak, understand what you're paying for, and more.",url:"https://kaivalo.com",image:"https://kaivalo.com/og-image.png",imageAlt:"Kai Valo - AI Tools That Actually Help",twitterCard:"summary_large_image"}}),Ka=Object.freeze(Object.defineProperty({__proto__:null,load:ca},Symbol.toStringTag,{value:"Module"}));var da=L("<button><!></button>");function va(e,t){ee(t,!0);let a=z(t,"variant",3,"primary"),r=z(t,"size",3,"md"),i=z(t,"disabled",3,!1),s=z(t,"class",3,"");const n="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",l={primary:"bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-300",secondary:"bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 disabled:bg-gray-100 disabled:text-gray-400",ghost:"bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500 disabled:text-gray-300"},c={sm:"px-3 py-1.5 text-sm",md:"px-4 py-2 text-base",lg:"px-6 py-3 text-lg"};let v=G(()=>`${n} ${l[a()]} ${c[r()]} ${i()?"cursor-not-allowed":""} ${s()}`.trim());var f=da();f.__click=function(...d){var m;(m=t.onclick)==null||m.apply(this,d)};var b=I(f);de(b,()=>t.children??ce),k(f),B(()=>{Z(f,1,X(T(v))),f.disabled=i()}),S(e,f),te()}tt(["click"]);var ga=L('<div class="px-6 py-4 border-b border-gray-200 font-semibold text-gray-900"> </div>'),ma=L('<a><!> <div class="p-6"><!></div></a>'),ha=L('<div class="px-6 py-4 border-b border-gray-200 font-semibold text-gray-900"> </div>'),_a=L('<div><!> <div class="p-6"><!></div></div>');function ba(e,t){ee(t,!0);let a=z(t,"variant",3,"default"),r=z(t,"href",3,""),i=z(t,"header",3,""),s=z(t,"hover",3,!0),n=z(t,"class",3,"");const l="bg-white rounded-xl border border-gray-200 overflow-hidden",c="transition-shadow hover:shadow-lg",v="cursor-pointer";let f=G(()=>`${l} ${s()?c:""} ${a()==="link"?v:""} ${n()}`.trim()),b=G(()=>a()==="link"&&r());var d=Q(),m=R(d);{var w=o=>{var u=ma(),x=I(u);{var C=h=>{var g=ga(),A=I(g,!0);k(g),B(()=>fe(A,i())),S(h,g)};pe(x,h=>{i()&&h(C)})}var _=N(x,2),$=I(_);de($,()=>t.children??ce),k(_),k(u),B(()=>{P(u,"href",r()),Z(u,1,X(T(f)))}),S(o,u)},p=o=>{var u=_a(),x=I(u);{var C=h=>{var g=ha(),A=I(g,!0);k(g),B(()=>fe(A,i())),S(h,g)};pe(x,h=>{i()&&h(C)})}var _=N(x,2),$=I(_);de($,()=>t.children??ce),k(_),k(u),B(()=>Z(u,1,X(T(f)))),S(o,u)};pe(m,o=>{T(b)?o(w):o(p,!1)})}S(e,d),te()}var pa=L("<span><!></span>");function xa(e,t){ee(t,!0);let a=z(t,"status",3,"default"),r=z(t,"size",3,"md"),i=z(t,"class",3,"");const s="inline-flex items-center font-medium rounded-full",n={live:"bg-emerald-100 text-emerald-800",beta:"bg-amber-100 text-amber-800","coming-soon":"bg-gray-100 text-gray-600",default:"bg-blue-100 text-blue-800"},l={sm:"px-2 py-0.5 text-xs",md:"px-2.5 py-1 text-sm"};let c=G(()=>`${s} ${n[a()]} ${l[r()]} ${i()}`.trim());var v=pa(),f=I(v);de(f,()=>t.children??ce),k(v),B(()=>Z(v,1,X(T(c)))),S(e,v),te()}var ya=L("<div><!></div>");function be(e,t){ee(t,!0);let a=z(t,"size",3,"lg"),r=z(t,"class",3,"");const i="w-full mx-auto px-4 sm:px-6 lg:px-8",s={sm:"max-w-screen-sm",md:"max-w-screen-md",lg:"max-w-screen-lg",xl:"max-w-screen-xl",full:"max-w-full"};let n=G(()=>`${i} ${s[a()]} ${r()}`.trim());var l=ya(),c=I(l);de(c,()=>t.children??ce),k(l),B(()=>Z(l,1,X(T(n)))),S(e,l),te()}/**
 * @license lucide-svelte v0.563.0 - ISC
 *
 * ISC License
 * 
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * 
 * ---
 * 
 * The MIT License (MIT) (for portions derived from Feather)
 * 
 * Copyright (c) 2013-2026 Cole Bemis
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */const wa={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
 * @license lucide-svelte v0.563.0 - ISC
 *
 * ISC License
 * 
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * 
 * ---
 * 
 * The MIT License (MIT) (for portions derived from Feather)
 * 
 * Copyright (c) 2013-2026 Cole Bemis
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */const Aa=e=>{for(const t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0;return!1};/**
 * @license lucide-svelte v0.563.0 - ISC
 *
 * ISC License
 * 
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * 
 * ---
 * 
 * The MIT License (MIT) (for portions derived from Feather)
 * 
 * Copyright (c) 2013-2026 Cole Bemis
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */const Ue=(...e)=>e.filter((t,a,r)=>!!t&&t.trim()!==""&&r.indexOf(t)===a).join(" ").trim();var Ea=ut("<svg><!><!></svg>");function Ae(e,t){const a=J(t,["children","$$slots","$$events","$$legacy"]),r=J(a,["name","color","size","strokeWidth","absoluteStrokeWidth","iconNode"]);ee(t,!1);let i=z(t,"name",8,void 0),s=z(t,"color",8,"currentColor"),n=z(t,"size",8,24),l=z(t,"strokeWidth",8,2),c=z(t,"absoluteStrokeWidth",8,!1),v=z(t,"iconNode",24,()=>[]);Gt();var f=Ea();Ke(f,(m,w,p)=>({...wa,...m,...r,width:n(),height:n(),stroke:s(),"stroke-width":w,class:p}),[()=>Aa(r)?void 0:{"aria-hidden":"true"},()=>(q(c()),q(l()),q(n()),Ve(()=>c()?Number(l())*24/Number(n()):l())),()=>(q(Ue),q(i()),q(a),Ve(()=>Ue("lucide-icon","lucide",i()?`lucide-${i()}`:"",a.class)))]);var b=I(f);rt(b,1,v,at,(m,w)=>{var p=G(()=>Vt(T(w),2));let o=()=>T(p)[0],u=()=>T(p)[1];var x=Q(),C=R(x);ea(C,o,!0,(_,$)=>{Ke(_,()=>({...u()}))}),S(m,x)});var d=N(b);ve(d,t,"default",{}),k(f),S(e,f),te()}function Ca(e,t){const a=J(t,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v0.563.0 - ISC
 *
 * ISC License
 *
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The MIT License (MIT) (for portions derived from Feather)
 *
 * Copyright (c) 2013-2026 Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const r=[["path",{d:"M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"}],["path",{d:"M9 18c-4.51 2-5-2-7-2"}]];Ae(e,we({name:"github"},()=>a,{get iconNode(){return r},children:(i,s)=>{var n=Q(),l=R(n);ve(l,t,"default",{}),S(i,n)},$$slots:{default:!0}}))}function Na(e,t){const a=J(t,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v0.563.0 - ISC
 *
 * ISC License
 *
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The MIT License (MIT) (for portions derived from Feather)
 *
 * Copyright (c) 2013-2026 Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const r=[["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"}],["rect",{x:"2",y:"4",width:"20",height:"16",rx:"2"}]];Ae(e,we({name:"mail"},()=>a,{get iconNode(){return r},children:(i,s)=>{var n=Q(),l=R(n);ve(l,t,"default",{}),S(i,n)},$$slots:{default:!0}}))}function ka(e,t){const a=J(t,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v0.563.0 - ISC
 *
 * ISC License
 *
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The MIT License (MIT) (for portions derived from Feather)
 *
 * Copyright (c) 2013-2026 Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const r=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{d:"M20 2v4"}],["path",{d:"M22 4h-4"}],["circle",{cx:"4",cy:"20",r:"2"}]];Ae(e,we({name:"sparkles"},()=>a,{get iconNode(){return r},children:(i,s)=>{var n=Q(),l=R(n);ve(l,t,"default",{}),S(i,n)},$$slots:{default:!0}}))}function Ta(e,t){const a=J(t,["children","$$slots","$$events","$$legacy"]);/**
 * @license lucide-svelte v0.563.0 - ISC
 *
 * ISC License
 *
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The MIT License (MIT) (for portions derived from Feather)
 *
 * Copyright (c) 2013-2026 Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */const r=[["path",{d:"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"}]];Ae(e,we({name:"wrench"},()=>a,{get iconNode(){return r},children:(i,s)=>{var n=Q(),l=R(n);ve(l,t,"default",{}),S(i,n)},$$slots:{default:!0}}))}var Sa=L('<meta name="description"/> <meta property="og:type" content="website"/> <meta property="og:url"/> <meta property="og:title"/> <meta property="og:description"/> <meta property="og:image"/> <meta property="og:image:alt"/> <meta name="twitter:card"/> <meta name="twitter:url"/> <meta name="twitter:title"/> <meta name="twitter:description"/> <meta name="twitter:image"/> <meta name="twitter:image:alt"/>',1),Ia=L('<h1 class="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6">AI Tools That Actually Help</h1> <p class="text-xl sm:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto">Practical tools built by Kai Valo. No hype, just utility.</p> <!>',1),$a=L('<div class="mt-4 text-blue-600 font-medium text-sm">Visit →</div>'),za=L('<div class="p-6 flex flex-col h-full"><div class="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4"><!></div> <div class="flex items-center gap-3 mb-3"><h3 class="text-xl font-semibold text-gray-900"> </h3> <!></div> <p class="text-gray-600 flex-grow"> </p> <!></div>'),Ma=L('<h2 class="text-3xl font-bold text-center text-gray-900 mb-12">Services</h2> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"></div>',1),Pa=L(`<div class="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 mx-auto mb-6 flex items-center justify-center"><span class="text-3xl font-bold text-white">K</span></div> <h2 class="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Built by Kai Valo</h2> <p class="text-lg text-gray-600 max-w-xl mx-auto mb-4">I build tools that solve real problems—no fluff, no buzzwords. Just practical AI that helps you understand what's actually going on.</p> <p class="text-base text-gray-500 max-w-xl mx-auto">Whether it's decoding mechanic speak or something else entirely, the goal is always the same: make complex things simple.</p>`,1),La=L('<div class="flex flex-col sm:flex-row items-center justify-between gap-4"><p class="text-sm">© 2026 Kai Valo</p> <div class="flex items-center gap-6"><a href="https://github.com/kaivalo" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-sm hover:text-white transition-colors"><!> <span>GitHub</span></a> <a href="mailto:kaievalo@proton.me" class="flex items-center gap-2 text-sm hover:text-white transition-colors"><!> <span>Contact</span></a></div></div>'),Oa=L('<section class="relative min-h-[80vh] flex items-center justify-center bg-gradient-to-b from-blue-50 via-white to-white"><!></section> <section id="services" class="py-20 bg-gray-50"><!></section> <section id="about" class="py-20 bg-white"><!></section> <footer class="py-8 bg-gray-900 text-gray-300"><!></footer>',1);function Wa(e,t){ee(t,!0);function a(){const m=document.getElementById("services");m&&m.scrollIntoView({behavior:"smooth"})}const r=[{icon:Ta,title:"MechanicAI",description:"Turn repair jargon into plain English. Know what you're paying for.",status:"live",link:"https://mechai.kaivalo.com"},{icon:ka,title:"Coming Soon",description:"More tools on the way.",status:"coming-soon",link:"#"}];var i=Oa();ta("1uha8ag",m=>{var w=Sa(),p=R(w),o=N(p,4),u=N(o,2),x=N(u,2),C=N(x,2),_=N(C,2),$=N(_,2),h=N($,2),g=N(h,2),A=N(g,2),M=N(A,2),y=N(M,2);B(()=>{P(p,"content",t.data.meta.description),P(o,"content",t.data.meta.url),P(u,"content",t.data.meta.title),P(x,"content",t.data.meta.description),P(C,"content",t.data.meta.image),P(_,"content",t.data.meta.imageAlt),P($,"content",t.data.meta.twitterCard),P(h,"content",t.data.meta.url),P(g,"content",t.data.meta.title),P(A,"content",t.data.meta.description),P(M,"content",t.data.meta.image),P(y,"content",t.data.meta.imageAlt)}),Bt(()=>{Rt.title=t.data.meta.title??""}),S(m,w)});var s=R(i),n=I(s);be(n,{size:"lg",class:"text-center py-20",children:(m,w)=>{var p=Ia(),o=N(R(p),4);va(o,{variant:"primary",size:"lg",onclick:a,children:(u,x)=>{re();var C=Pe("View Services");S(u,C)},$$slots:{default:!0}}),S(m,p)},$$slots:{default:!0}}),k(s);var l=N(s,2),c=I(l);be(c,{size:"lg",children:(m,w)=>{var p=Ma(),o=N(R(p),2);rt(o,21,()=>r,at,(u,x)=>{{let C=G(()=>T(x).link!=="#"?"link":"default"),_=G(()=>T(x).link!=="#"?T(x).link:void 0);ba(u,{get variant(){return T(C)},get href(){return T(_)},hover:!0,class:"flex flex-col h-full",children:($,h)=>{var g=za(),A=I(g),M=I(A);Ut(M,()=>T(x).icon,(V,O)=>{O(V,{class:"w-6 h-6 text-blue-600"})}),k(A);var y=N(A,2),H=I(y),j=I(H,!0);k(H);var ge=N(H,2);xa(ge,{get status(){return T(x).status},size:"sm",children:(V,O)=>{re();var ae=Pe();B(()=>fe(ae,T(x).status==="live"?"Live":T(x).status==="beta"?"Beta":"Coming Soon")),S(V,ae)},$$slots:{default:!0}}),k(y);var Y=N(y,2),me=I(Y,!0);k(Y);var he=N(Y,2);{var _e=V=>{var O=$a();S(V,O)};pe(he,V=>{T(x).link!=="#"&&V(_e)})}k(g),B(()=>{fe(j,T(x).title),fe(me,T(x).description)}),S($,g)},$$slots:{default:!0}})}}),k(o),S(m,p)},$$slots:{default:!0}}),k(l);var v=N(l,2),f=I(v);be(f,{size:"md",class:"text-center",children:(m,w)=>{var p=Pa();re(6),S(m,p)},$$slots:{default:!0}}),k(v);var b=N(v,2),d=I(b);be(d,{size:"lg",children:(m,w)=>{var p=La(),o=N(I(p),2),u=I(o),x=I(u);Ca(x,{class:"w-4 h-4"}),re(2),k(u);var C=N(u,2),_=I(C);Na(_,{class:"w-4 h-4"}),re(2),k(C),k(o),k(p),S(m,p)},$$slots:{default:!0}}),k(b),S(e,i),te()}export{Wa as component,Ka as universal};
