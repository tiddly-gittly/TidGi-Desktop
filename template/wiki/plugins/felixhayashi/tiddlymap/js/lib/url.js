"use strict";Object.defineProperty(exports,"__esModule",{value:true});
/* @preserve TW-Guard */
/*\

title: $:/plugins/felixhayashi/tiddlymap/js/URL
type: application/javascript
module-type: library

@preserve

\*/
/* @preserve TW-Guard */
/**
 * <<<
 * Lightweight URL manipulation with JavaScript. This library is
 * independent of any other libraries and has pretty simple interface
 * and lightweight code-base. Some ideas of query string parsing
 * had been taken from Jan Wolter."
 *
 * @see http://unixpapa.com/js/querystring.html
 * @license MIT
 * @author Mykhailo Stadnyk <mikhus@gmail.com>
 * <<< https://github.com/Mikhus/jsurl
 *
 * @class
 * @param {string} url
 */function Url(t){this.paths=function(t){var e="",r=0,o;if(t&&t.length&&t+""!==t){if(this.isAbsolute()){e="/"}for(o=t.length;r<o;r++){t[r]=encode(t[r])}this.path=e+t.join("/")}t=(this.path.charAt(0)==="/"?this.path.slice(1):this.path).split("/");for(r=0,o=t.length;r<o;r++){t[r]=decode(t[r])}return t};this.encode=encode;this.decode=decode;this.isAbsolute=function(){return this.protocol||this.path.charAt(0)==="/"};this.toString=function(){return(this.protocol&&this.protocol+"://")+(this.user&&encode(this.user)+(this.pass&&":"+encode(this.pass))+"@")+(this.host&&this.host)+(this.port&&":"+this.port)+(this.path&&this.path)+(this.query.toString()&&"?"+this.query)+(this.hash&&"#"+encode(this.hash))};parse(this,t)}var map={protocol:"protocol",host:"hostname",port:"port",path:"pathname",query:"search",hash:"hash"},defaultPorts={ftp:21,gopher:70,http:80,https:443,ws:80,wss:443},parse=function t(e,r){var o=document,s=o.createElement("a"),r=r||o.location.href,i=r.match(/\/\/(.*?)(?::(.*?))?@/)||[],n;s.href=r;for(n in map){e[n]=s[map[n]]||""}e.protocol=e.protocol.replace(/:$/,"");e.query=e.query.replace(/^\?/,"");e.hash=decode(e.hash.replace(/^#/,""));e.user=decode(i[1]||"");e.pass=decode(i[2]||"");e.port=defaultPorts[e.protocol]==e.port||e.port==0?"":e.port;if(!e.protocol&&!/^([a-z]+:)?\/\//.test(r)){var h=new Url(o.location.href.match(/(.*\/)/)[0]),a=h.path.split("/"),p=e.path.split("/"),c=["protocol","user","pass","host","port"],f=c.length;a.pop();for(n=0;n<f;n++){e[c[n]]=h[c[n]]}while(p[0]==".."){a.pop();p.shift()}e.path=(r.charAt(0)!="/"?a.join("/"):"")+"/"+p.join("/")}else{e.path=e.path.replace(/^\/?/,"/")}e.paths((e.path.charAt(0)=="/"?e.path.slice(1):e.path).split("/"));parseQs(e)},encode=function t(e){return encodeURIComponent(e).replace(/'/g,"%27")},decode=function t(e){e=e.replace(/\+/g," ");e=e.replace(/%([ef][0-9a-f])%([89ab][0-9a-f])%([89ab][0-9a-f])/gi,function(t,e,r,o){var s=parseInt(e,16)-224,i=parseInt(r,16)-128;if(s==0&&i<32){return t}var n=parseInt(o,16)-128,h=(s<<12)+(i<<6)+n;if(h>65535){return t}return String.fromCharCode(h)});e=e.replace(/%([cd][0-9a-f])%([89ab][0-9a-f])/gi,function(t,e,r){var o=parseInt(e,16)-192;if(o<2){return t}var s=parseInt(r,16)-128;return String.fromCharCode((o<<6)+s)});e=e.replace(/%([0-7][0-9a-f])/gi,function(t,e){return String.fromCharCode(parseInt(e,16))});return e},parseQs=function t(e){var r=e.query;e.query=new function(t){var e=/([^=&]+)(=([^&]*))?/g,r;while(r=e.exec(t)){var o=decodeURIComponent(r[1].replace(/\+/g," ")),s=r[3]?decode(r[3]):"";if(this[o]!=null){if(!(this[o]instanceof Array)){this[o]=[this[o]]}this[o].push(s)}else{this[o]=s}}this.clear=function(){for(var t in this){if(!(this[t]instanceof Function)){delete this[t]}}};this.count=function(){var t=0,e;for(e in this){if(!(this[e]instanceof Function)){t++}}return t};this.isEmpty=function(){return this.count()===0};this.toString=function(){var t="",e=encode,r,o;for(r in this){if(this[r]instanceof Function){continue}if(this[r]instanceof Array){var s=this[r].length;if(s){for(o=0;o<s;o++){t+=t?"&":"";t+=e(r)+"="+e(this[r][o])}}else{t+=(t?"&":"")+e(r)+"="}}else{t+=t?"&":"";t+=e(r)+"="+e(this[r])}}return t}}(r)};exports.default=Url;
//# sourceMappingURL=./maps/felixhayashi/tiddlymap/js/lib/url.js.map
