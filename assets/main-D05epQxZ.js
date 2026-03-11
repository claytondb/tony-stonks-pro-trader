import{T as hn,a as Li,b as Ls,L as si,c as bt,F as Ni,M as De,V as le,C as B,d as Fe,S as ue,e as ji,P as zt,D as xt,f as N,g as m,I as Ps,Q as G,h as pn,O as Ze,i as vt,j as un,B as Le,k as mn,l as Rs,N as fn,m as gn,n as yn,o as _s,p as bn,R as me,q as wn,r as Pi,s as zi,t as hi,u as ai,v as T,w as Hi,x as Ke,y as Ht,z as Oe,A as Is,E as f,G as Os,H as Me,J as xn,K as Ui,U as A,W as qt,X as R,Y as qi,Z as Fs,_ as Ds,$ as Ri,a0 as vn,a1 as Gs,a2 as Sn,a3 as Gt,a4 as _i,a5 as Ii,a6 as ni,a7 as Ji,a8 as Tn,a9 as kn,aa as Cn,ab as En,ac as ne,ad as ri,ae as Mn,af as pi,ag as An,ah as Bs,ai as li,aj as $e,ak as Ln,al as Pn,am as Rn,an as Ot,ao as pe,ap as Vi,aq as $i,ar as _n,as as Xi,at as Ns,au as js,av as zs,aw as In,ax as Hs,ay as Us,az as On,aA as Fn,aB as es,aC as Dn,aD as k,aE as O,aF as oi,aG as Gn,aH as Bt,aI as Nt,aJ as at,aK as Bn,aL as Xe,aM as ft,aN as ts,aO as Nn,aP as jn,aQ as qs,aR as Kt,aS as Pt,aT as is}from"./three-CGT8EUp4.js";import{g as V}from"./rapier-CzhdNTKe.js";(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const n of s)if(n.type==="childList")for(const o of n.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&i(o)}).observe(document,{childList:!0,subtree:!0});function t(s){const n={};return s.integrity&&(n.integrity=s.integrity),s.referrerPolicy&&(n.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?n.credentials="include":s.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function i(s){if(s.ep)return;s.ep=!0;const n=t(s);fetch(s.href,n)}})();function ss(p,e){if(e===hn)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),p;if(e===Li||e===Ls){let t=p.getIndex();if(t===null){const o=[],a=p.getAttribute("position");if(a!==void 0){for(let r=0;r<a.count;r++)o.push(r);p.setIndex(o),t=p.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),p}const i=t.count-2,s=[];if(e===Li)for(let o=1;o<=i;o++)s.push(t.getX(0)),s.push(t.getX(o)),s.push(t.getX(o+1));else for(let o=0;o<i;o++)o%2===0?(s.push(t.getX(o)),s.push(t.getX(o+1)),s.push(t.getX(o+2))):(s.push(t.getX(o+2)),s.push(t.getX(o+1)),s.push(t.getX(o)));s.length/3!==i&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");const n=p.clone();return n.setIndex(s),n.clearGroups(),n}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",e),p}class Ut extends si{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new Vn(t)}),this.register(function(t){return new eo(t)}),this.register(function(t){return new to(t)}),this.register(function(t){return new io(t)}),this.register(function(t){return new Xn(t)}),this.register(function(t){return new Yn(t)}),this.register(function(t){return new Kn(t)}),this.register(function(t){return new Wn(t)}),this.register(function(t){return new qn(t)}),this.register(function(t){return new Zn(t)}),this.register(function(t){return new $n(t)}),this.register(function(t){return new Jn(t)}),this.register(function(t){return new Qn(t)}),this.register(function(t){return new Hn(t)}),this.register(function(t){return new so(t)}),this.register(function(t){return new no(t)})}load(e,t,i,s){const n=this;let o;if(this.resourcePath!=="")o=this.resourcePath;else if(this.path!==""){const l=bt.extractUrlBase(e);o=bt.resolveURL(l,this.path)}else o=bt.extractUrlBase(e);this.manager.itemStart(e);const a=function(l){s?s(l):console.error(l),n.manager.itemError(e),n.manager.itemEnd(e)},r=new Ni(this.manager);r.setPath(this.path),r.setResponseType("arraybuffer"),r.setRequestHeader(this.requestHeader),r.setWithCredentials(this.withCredentials),r.load(e,function(l){try{n.parse(l,o,function(d){t(d),n.manager.itemEnd(e)},a)}catch(d){a(d)}},i,a)}setDRACOLoader(e){return this.dracoLoader=e,this}setDDSLoader(){throw new Error('THREE.GLTFLoader: "MSFT_texture_dds" no longer supported. Please update to "KHR_texture_basisu".')}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,i,s){let n;const o={},a={},r=new TextDecoder;if(typeof e=="string")n=JSON.parse(e);else if(e instanceof ArrayBuffer)if(r.decode(new Uint8Array(e,0,4))===Vs){try{o[D.KHR_BINARY_GLTF]=new oo(e)}catch(c){s&&s(c);return}n=JSON.parse(o[D.KHR_BINARY_GLTF].content)}else n=JSON.parse(r.decode(e));else n=e;if(n.asset===void 0||n.asset.version[0]<2){s&&s(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}const l=new wo(n,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});l.fileLoader.setRequestHeader(this.requestHeader);for(let d=0;d<this.pluginCallbacks.length;d++){const c=this.pluginCallbacks[d](l);c.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),a[c.name]=c,o[c.name]=!0}if(n.extensionsUsed)for(let d=0;d<n.extensionsUsed.length;++d){const c=n.extensionsUsed[d],h=n.extensionsRequired||[];switch(c){case D.KHR_MATERIALS_UNLIT:o[c]=new Un;break;case D.KHR_DRACO_MESH_COMPRESSION:o[c]=new ao(n,this.dracoLoader);break;case D.KHR_TEXTURE_TRANSFORM:o[c]=new ro;break;case D.KHR_MESH_QUANTIZATION:o[c]=new lo;break;default:h.indexOf(c)>=0&&a[c]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+c+'".')}}l.setExtensions(o),l.setPlugins(a),l.parse(i,s)}parseAsync(e,t){const i=this;return new Promise(function(s,n){i.parse(e,t,s,n)})}}function zn(){let p={};return{get:function(e){return p[e]},add:function(e,t){p[e]=t},remove:function(e){delete p[e]},removeAll:function(){p={}}}}const D={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class Hn{constructor(e){this.parser=e,this.name=D.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const e=this.parser,t=this.parser.json.nodes||[];for(let i=0,s=t.length;i<s;i++){const n=t[i];n.extensions&&n.extensions[this.name]&&n.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,n.extensions[this.name].light)}}_loadLight(e){const t=this.parser,i="light:"+e;let s=t.cache.get(i);if(s)return s;const n=t.json,r=((n.extensions&&n.extensions[this.name]||{}).lights||[])[e];let l;const d=new B(16777215);r.color!==void 0&&d.setRGB(r.color[0],r.color[1],r.color[2],Fe);const c=r.range!==void 0?r.range:0;switch(r.type){case"directional":l=new xt(d),l.target.position.set(0,0,-1),l.add(l.target);break;case"point":l=new zt(d),l.distance=c;break;case"spot":l=new ji(d),l.distance=c,r.spot=r.spot||{},r.spot.innerConeAngle=r.spot.innerConeAngle!==void 0?r.spot.innerConeAngle:0,r.spot.outerConeAngle=r.spot.outerConeAngle!==void 0?r.spot.outerConeAngle:Math.PI/4,l.angle=r.spot.outerConeAngle,l.penumbra=1-r.spot.innerConeAngle/r.spot.outerConeAngle,l.target.position.set(0,0,-1),l.add(l.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+r.type)}return l.position.set(0,0,0),l.decay=2,Ye(l,r),r.intensity!==void 0&&(l.intensity=r.intensity),l.name=t.createUniqueName(r.name||"light_"+e),s=Promise.resolve(l),t.cache.add(i,s),s}getDependency(e,t){if(e==="light")return this._loadLight(t)}createNodeAttachment(e){const t=this,i=this.parser,n=i.json.nodes[e],a=(n.extensions&&n.extensions[this.name]||{}).light;return a===void 0?null:this._loadLight(a).then(function(r){return i._getNodeRef(t.cache,a,r)})}}class Un{constructor(){this.name=D.KHR_MATERIALS_UNLIT}getMaterialType(){return Ke}extendParams(e,t,i){const s=[];e.color=new B(1,1,1),e.opacity=1;const n=t.pbrMetallicRoughness;if(n){if(Array.isArray(n.baseColorFactor)){const o=n.baseColorFactor;e.color.setRGB(o[0],o[1],o[2],Fe),e.opacity=o[3]}n.baseColorTexture!==void 0&&s.push(i.assignTexture(e,"map",n.baseColorTexture,ue))}return Promise.all(s)}}class qn{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){const s=this.parser.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=s.extensions[this.name].emissiveStrength;return n!==void 0&&(t.emissiveIntensity=n),Promise.resolve()}}class Vn{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const i=this.parser,s=i.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=[],o=s.extensions[this.name];if(o.clearcoatFactor!==void 0&&(t.clearcoat=o.clearcoatFactor),o.clearcoatTexture!==void 0&&n.push(i.assignTexture(t,"clearcoatMap",o.clearcoatTexture)),o.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=o.clearcoatRoughnessFactor),o.clearcoatRoughnessTexture!==void 0&&n.push(i.assignTexture(t,"clearcoatRoughnessMap",o.clearcoatRoughnessTexture)),o.clearcoatNormalTexture!==void 0&&(n.push(i.assignTexture(t,"clearcoatNormalMap",o.clearcoatNormalTexture)),o.clearcoatNormalTexture.scale!==void 0)){const a=o.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new le(a,a)}return Promise.all(n)}}class $n{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const i=this.parser,s=i.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=[],o=s.extensions[this.name];return o.iridescenceFactor!==void 0&&(t.iridescence=o.iridescenceFactor),o.iridescenceTexture!==void 0&&n.push(i.assignTexture(t,"iridescenceMap",o.iridescenceTexture)),o.iridescenceIor!==void 0&&(t.iridescenceIOR=o.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),o.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=o.iridescenceThicknessMaximum),o.iridescenceThicknessTexture!==void 0&&n.push(i.assignTexture(t,"iridescenceThicknessMap",o.iridescenceThicknessTexture)),Promise.all(n)}}class Xn{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_SHEEN}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const i=this.parser,s=i.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=[];t.sheenColor=new B(0,0,0),t.sheenRoughness=0,t.sheen=1;const o=s.extensions[this.name];if(o.sheenColorFactor!==void 0){const a=o.sheenColorFactor;t.sheenColor.setRGB(a[0],a[1],a[2],Fe)}return o.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=o.sheenRoughnessFactor),o.sheenColorTexture!==void 0&&n.push(i.assignTexture(t,"sheenColorMap",o.sheenColorTexture,ue)),o.sheenRoughnessTexture!==void 0&&n.push(i.assignTexture(t,"sheenRoughnessMap",o.sheenRoughnessTexture)),Promise.all(n)}}class Yn{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const i=this.parser,s=i.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=[],o=s.extensions[this.name];return o.transmissionFactor!==void 0&&(t.transmission=o.transmissionFactor),o.transmissionTexture!==void 0&&n.push(i.assignTexture(t,"transmissionMap",o.transmissionTexture)),Promise.all(n)}}class Kn{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_VOLUME}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const i=this.parser,s=i.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=[],o=s.extensions[this.name];t.thickness=o.thicknessFactor!==void 0?o.thicknessFactor:0,o.thicknessTexture!==void 0&&n.push(i.assignTexture(t,"thicknessMap",o.thicknessTexture)),t.attenuationDistance=o.attenuationDistance||1/0;const a=o.attenuationColor||[1,1,1];return t.attenuationColor=new B().setRGB(a[0],a[1],a[2],Fe),Promise.all(n)}}class Wn{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_IOR}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const s=this.parser.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=s.extensions[this.name];return t.ior=n.ior!==void 0?n.ior:1.5,Promise.resolve()}}class Zn{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_SPECULAR}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const i=this.parser,s=i.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=[],o=s.extensions[this.name];t.specularIntensity=o.specularFactor!==void 0?o.specularFactor:1,o.specularTexture!==void 0&&n.push(i.assignTexture(t,"specularIntensityMap",o.specularTexture));const a=o.specularColorFactor||[1,1,1];return t.specularColor=new B().setRGB(a[0],a[1],a[2],Fe),o.specularColorTexture!==void 0&&n.push(i.assignTexture(t,"specularColorMap",o.specularColorTexture,ue)),Promise.all(n)}}class Qn{constructor(e){this.parser=e,this.name=D.EXT_MATERIALS_BUMP}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const i=this.parser,s=i.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=[],o=s.extensions[this.name];return t.bumpScale=o.bumpFactor!==void 0?o.bumpFactor:1,o.bumpTexture!==void 0&&n.push(i.assignTexture(t,"bumpMap",o.bumpTexture)),Promise.all(n)}}class Jn{constructor(e){this.parser=e,this.name=D.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){const i=this.parser.json.materials[e];return!i.extensions||!i.extensions[this.name]?null:De}extendMaterialParams(e,t){const i=this.parser,s=i.json.materials[e];if(!s.extensions||!s.extensions[this.name])return Promise.resolve();const n=[],o=s.extensions[this.name];return o.anisotropyStrength!==void 0&&(t.anisotropy=o.anisotropyStrength),o.anisotropyRotation!==void 0&&(t.anisotropyRotation=o.anisotropyRotation),o.anisotropyTexture!==void 0&&n.push(i.assignTexture(t,"anisotropyMap",o.anisotropyTexture)),Promise.all(n)}}class eo{constructor(e){this.parser=e,this.name=D.KHR_TEXTURE_BASISU}loadTexture(e){const t=this.parser,i=t.json,s=i.textures[e];if(!s.extensions||!s.extensions[this.name])return null;const n=s.extensions[this.name],o=t.options.ktx2Loader;if(!o){if(i.extensionsRequired&&i.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(e,n.source,o)}}class to{constructor(e){this.parser=e,this.name=D.EXT_TEXTURE_WEBP,this.isSupported=null}loadTexture(e){const t=this.name,i=this.parser,s=i.json,n=s.textures[e];if(!n.extensions||!n.extensions[t])return null;const o=n.extensions[t],a=s.images[o.source];let r=i.textureLoader;if(a.uri){const l=i.options.manager.getHandler(a.uri);l!==null&&(r=l)}return this.detectSupport().then(function(l){if(l)return i.loadTextureImage(e,o.source,r);if(s.extensionsRequired&&s.extensionsRequired.indexOf(t)>=0)throw new Error("THREE.GLTFLoader: WebP required by asset but unsupported.");return i.loadTexture(e)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(e){const t=new Image;t.src="data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",t.onload=t.onerror=function(){e(t.height===1)}})),this.isSupported}}class io{constructor(e){this.parser=e,this.name=D.EXT_TEXTURE_AVIF,this.isSupported=null}loadTexture(e){const t=this.name,i=this.parser,s=i.json,n=s.textures[e];if(!n.extensions||!n.extensions[t])return null;const o=n.extensions[t],a=s.images[o.source];let r=i.textureLoader;if(a.uri){const l=i.options.manager.getHandler(a.uri);l!==null&&(r=l)}return this.detectSupport().then(function(l){if(l)return i.loadTextureImage(e,o.source,r);if(s.extensionsRequired&&s.extensionsRequired.indexOf(t)>=0)throw new Error("THREE.GLTFLoader: AVIF required by asset but unsupported.");return i.loadTexture(e)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(e){const t=new Image;t.src="data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=",t.onload=t.onerror=function(){e(t.height===1)}})),this.isSupported}}class so{constructor(e){this.name=D.EXT_MESHOPT_COMPRESSION,this.parser=e}loadBufferView(e){const t=this.parser.json,i=t.bufferViews[e];if(i.extensions&&i.extensions[this.name]){const s=i.extensions[this.name],n=this.parser.getDependency("buffer",s.buffer),o=this.parser.options.meshoptDecoder;if(!o||!o.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return n.then(function(a){const r=s.byteOffset||0,l=s.byteLength||0,d=s.count,c=s.byteStride,h=new Uint8Array(a,r,l);return o.decodeGltfBufferAsync?o.decodeGltfBufferAsync(d,c,h,s.mode,s.filter).then(function(u){return u.buffer}):o.ready.then(function(){const u=new ArrayBuffer(d*c);return o.decodeGltfBuffer(new Uint8Array(u),d,c,h,s.mode,s.filter),u})})}else return null}}class no{constructor(e){this.name=D.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){const t=this.parser.json,i=t.nodes[e];if(!i.extensions||!i.extensions[this.name]||i.mesh===void 0)return null;const s=t.meshes[i.mesh];for(const l of s.primitives)if(l.mode!==we.TRIANGLES&&l.mode!==we.TRIANGLE_STRIP&&l.mode!==we.TRIANGLE_FAN&&l.mode!==void 0)return null;const o=i.extensions[this.name].attributes,a=[],r={};for(const l in o)a.push(this.parser.getDependency("accessor",o[l]).then(d=>(r[l]=d,r[l])));return a.length<1?null:(a.push(this.parser.createNodeMesh(e)),Promise.all(a).then(l=>{const d=l.pop(),c=d.isGroup?d.children:[d],h=l[0].count,u=[];for(const y of c){const b=new N,w=new m,x=new G,v=new m(1,1,1),S=new Ps(y.geometry,y.material,h);for(let C=0;C<h;C++)r.TRANSLATION&&w.fromBufferAttribute(r.TRANSLATION,C),r.ROTATION&&x.fromBufferAttribute(r.ROTATION,C),r.SCALE&&v.fromBufferAttribute(r.SCALE,C),S.setMatrixAt(C,b.compose(w,x,v));for(const C in r)if(C==="_COLOR_0"){const P=r[C];S.instanceColor=new pn(P.array,P.itemSize,P.normalized)}else C!=="TRANSLATION"&&C!=="ROTATION"&&C!=="SCALE"&&y.geometry.setAttribute(C,r[C]);Ze.prototype.copy.call(S,y),this.parser.assignFinalMaterial(S),u.push(S)}return d.isGroup?(d.clear(),d.add(...u),d):u[0]}))}}const Vs="glTF",Rt=12,ns={JSON:1313821514,BIN:5130562};class oo{constructor(e){this.name=D.KHR_BINARY_GLTF,this.content=null,this.body=null;const t=new DataView(e,0,Rt),i=new TextDecoder;if(this.header={magic:i.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==Vs)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const s=this.header.length-Rt,n=new DataView(e,Rt);let o=0;for(;o<s;){const a=n.getUint32(o,!0);o+=4;const r=n.getUint32(o,!0);if(o+=4,r===ns.JSON){const l=new Uint8Array(e,Rt+o,a);this.content=i.decode(l)}else if(r===ns.BIN){const l=Rt+o;this.body=e.slice(l,l+a)}o+=a}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class ao{constructor(e,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=D.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){const i=this.json,s=this.dracoLoader,n=e.extensions[this.name].bufferView,o=e.extensions[this.name].attributes,a={},r={},l={};for(const d in o){const c=Oi[d]||d.toLowerCase();a[c]=o[d]}for(const d in e.attributes){const c=Oi[d]||d.toLowerCase();if(o[d]!==void 0){const h=i.accessors[e.attributes[d]],u=wt[h.componentType];l[c]=u.name,r[c]=h.normalized===!0}}return t.getDependency("bufferView",n).then(function(d){return new Promise(function(c,h){s.decodeDracoFile(d,function(u){for(const y in u.attributes){const b=u.attributes[y],w=r[y];w!==void 0&&(b.normalized=w)}c(u)},a,l,Fe,h)})})}}class ro{constructor(){this.name=D.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){return(t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0||(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),e.needsUpdate=!0),e}}class lo{constructor(){this.name=D.KHR_MESH_QUANTIZATION}}class $s extends kn{constructor(e,t,i,s){super(e,t,i,s)}copySampleValue_(e){const t=this.resultBuffer,i=this.sampleValues,s=this.valueSize,n=e*s*3+s;for(let o=0;o!==s;o++)t[o]=i[n+o];return t}interpolate_(e,t,i,s){const n=this.resultBuffer,o=this.sampleValues,a=this.valueSize,r=a*2,l=a*3,d=s-t,c=(i-t)/d,h=c*c,u=h*c,y=e*l,b=y-l,w=-2*u+3*h,x=u-h,v=1-w,S=x-h+c;for(let C=0;C!==a;C++){const P=o[b+C+a],L=o[b+C+r]*d,M=o[y+C+a],_=o[y+C]*d;n[C]=v*P+S*L+w*M+x*_}return n}}const co=new G;class ho extends $s{interpolate_(e,t,i,s){const n=super.interpolate_(e,t,i,s);return co.fromArray(n).normalize().toArray(n),n}}const we={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6},wt={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},os={9728:bn,9729:_s,9984:yn,9985:gn,9986:fn,9987:Rs},as={33071:Pi,33648:wn,10497:me},ui={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Oi={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},He={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},po={CUBICSPLINE:void 0,LINEAR:Gs,STEP:vn},mi={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function uo(p){return p.DefaultMaterial===void 0&&(p.DefaultMaterial=new T({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Tn})),p.DefaultMaterial}function st(p,e,t){for(const i in t.extensions)p[i]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[i]=t.extensions[i])}function Ye(p,e){e.extras!==void 0&&(typeof e.extras=="object"?Object.assign(p.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+e.extras))}function mo(p,e,t){let i=!1,s=!1,n=!1;for(let l=0,d=e.length;l<d;l++){const c=e[l];if(c.POSITION!==void 0&&(i=!0),c.NORMAL!==void 0&&(s=!0),c.COLOR_0!==void 0&&(n=!0),i&&s&&n)break}if(!i&&!s&&!n)return Promise.resolve(p);const o=[],a=[],r=[];for(let l=0,d=e.length;l<d;l++){const c=e[l];if(i){const h=c.POSITION!==void 0?t.getDependency("accessor",c.POSITION):p.attributes.position;o.push(h)}if(s){const h=c.NORMAL!==void 0?t.getDependency("accessor",c.NORMAL):p.attributes.normal;a.push(h)}if(n){const h=c.COLOR_0!==void 0?t.getDependency("accessor",c.COLOR_0):p.attributes.color;r.push(h)}}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(r)]).then(function(l){const d=l[0],c=l[1],h=l[2];return i&&(p.morphAttributes.position=d),s&&(p.morphAttributes.normal=c),n&&(p.morphAttributes.color=h),p.morphTargetsRelative=!0,p})}function fo(p,e){if(p.updateMorphTargets(),e.weights!==void 0)for(let t=0,i=e.weights.length;t<i;t++)p.morphTargetInfluences[t]=e.weights[t];if(e.extras&&Array.isArray(e.extras.targetNames)){const t=e.extras.targetNames;if(p.morphTargetInfluences.length===t.length){p.morphTargetDictionary={};for(let i=0,s=t.length;i<s;i++)p.morphTargetDictionary[t[i]]=i}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function go(p){let e;const t=p.extensions&&p.extensions[D.KHR_DRACO_MESH_COMPRESSION];if(t?e="draco:"+t.bufferView+":"+t.indices+":"+fi(t.attributes):e=p.indices+":"+fi(p.attributes)+":"+p.mode,p.targets!==void 0)for(let i=0,s=p.targets.length;i<s;i++)e+=":"+fi(p.targets[i]);return e}function fi(p){let e="";const t=Object.keys(p).sort();for(let i=0,s=t.length;i<s;i++)e+=t[i]+":"+p[t[i]]+";";return e}function Fi(p){switch(p){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function yo(p){return p.search(/\.jpe?g($|\?)/i)>0||p.search(/^data\:image\/jpeg/)===0?"image/jpeg":p.search(/\.webp($|\?)/i)>0||p.search(/^data\:image\/webp/)===0?"image/webp":"image/png"}const bo=new N;class wo{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new zn,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let i=!1,s=!1,n=-1;typeof navigator<"u"&&(i=/^((?!chrome|android).)*safari/i.test(navigator.userAgent)===!0,s=navigator.userAgent.indexOf("Firefox")>-1,n=s?navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1]:-1),typeof createImageBitmap>"u"||i||s&&n<98?this.textureLoader=new vt(this.options.manager):this.textureLoader=new un(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new Ni(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){const i=this,s=this.json,n=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(o){return o._markDefs&&o._markDefs()}),Promise.all(this._invokeAll(function(o){return o.beforeRoot&&o.beforeRoot()})).then(function(){return Promise.all([i.getDependencies("scene"),i.getDependencies("animation"),i.getDependencies("camera")])}).then(function(o){const a={scene:o[0][s.scene||0],scenes:o[0],animations:o[1],cameras:o[2],asset:s.asset,parser:i,userData:{}};return st(n,a,s),Ye(a,s),Promise.all(i._invokeAll(function(r){return r.afterRoot&&r.afterRoot(a)})).then(function(){e(a)})}).catch(t)}_markDefs(){const e=this.json.nodes||[],t=this.json.skins||[],i=this.json.meshes||[];for(let s=0,n=t.length;s<n;s++){const o=t[s].joints;for(let a=0,r=o.length;a<r;a++)e[o[a]].isBone=!0}for(let s=0,n=e.length;s<n;s++){const o=e[s];o.mesh!==void 0&&(this._addNodeRef(this.meshCache,o.mesh),o.skin!==void 0&&(i[o.mesh].isSkinnedMesh=!0)),o.camera!==void 0&&this._addNodeRef(this.cameraCache,o.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,i){if(e.refs[t]<=1)return i;const s=i.clone(),n=(o,a)=>{const r=this.associations.get(o);r!=null&&this.associations.set(a,r);for(const[l,d]of o.children.entries())n(d,a.children[l])};return n(i,s),s.name+="_instance_"+e.uses[t]++,s}_invokeOne(e){const t=Object.values(this.plugins);t.push(this);for(let i=0;i<t.length;i++){const s=e(t[i]);if(s)return s}return null}_invokeAll(e){const t=Object.values(this.plugins);t.unshift(this);const i=[];for(let s=0;s<t.length;s++){const n=e(t[s]);n&&i.push(n)}return i}getDependency(e,t){const i=e+":"+t;let s=this.cache.get(i);if(!s){switch(e){case"scene":s=this.loadScene(t);break;case"node":s=this._invokeOne(function(n){return n.loadNode&&n.loadNode(t)});break;case"mesh":s=this._invokeOne(function(n){return n.loadMesh&&n.loadMesh(t)});break;case"accessor":s=this.loadAccessor(t);break;case"bufferView":s=this._invokeOne(function(n){return n.loadBufferView&&n.loadBufferView(t)});break;case"buffer":s=this.loadBuffer(t);break;case"material":s=this._invokeOne(function(n){return n.loadMaterial&&n.loadMaterial(t)});break;case"texture":s=this._invokeOne(function(n){return n.loadTexture&&n.loadTexture(t)});break;case"skin":s=this.loadSkin(t);break;case"animation":s=this._invokeOne(function(n){return n.loadAnimation&&n.loadAnimation(t)});break;case"camera":s=this.loadCamera(t);break;default:if(s=this._invokeOne(function(n){return n!=this&&n.getDependency&&n.getDependency(e,t)}),!s)throw new Error("Unknown type: "+e);break}this.cache.add(i,s)}return s}getDependencies(e){let t=this.cache.get(e);if(!t){const i=this,s=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(s.map(function(n,o){return i.getDependency(e,o)})),this.cache.add(e,t)}return t}loadBuffer(e){const t=this.json.buffers[e],i=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[D.KHR_BINARY_GLTF].body);const s=this.options;return new Promise(function(n,o){i.load(bt.resolveURL(t.uri,s.path),n,void 0,function(){o(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){const t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(i){const s=t.byteLength||0,n=t.byteOffset||0;return i.slice(n,n+s)})}loadAccessor(e){const t=this,i=this.json,s=this.json.accessors[e];if(s.bufferView===void 0&&s.sparse===void 0){const o=ui[s.type],a=wt[s.componentType],r=s.normalized===!0,l=new a(s.count*o);return Promise.resolve(new Le(l,o,r))}const n=[];return s.bufferView!==void 0?n.push(this.getDependency("bufferView",s.bufferView)):n.push(null),s.sparse!==void 0&&(n.push(this.getDependency("bufferView",s.sparse.indices.bufferView)),n.push(this.getDependency("bufferView",s.sparse.values.bufferView))),Promise.all(n).then(function(o){const a=o[0],r=ui[s.type],l=wt[s.componentType],d=l.BYTES_PER_ELEMENT,c=d*r,h=s.byteOffset||0,u=s.bufferView!==void 0?i.bufferViews[s.bufferView].byteStride:void 0,y=s.normalized===!0;let b,w;if(u&&u!==c){const x=Math.floor(h/u),v="InterleavedBuffer:"+s.bufferView+":"+s.componentType+":"+x+":"+s.count;let S=t.cache.get(v);S||(b=new l(a,x*u,s.count*u/d),S=new mn(b,u/d),t.cache.add(v,S)),w=new Sn(S,r,h%u/d,y)}else a===null?b=new l(s.count*r):b=new l(a,h,s.count*r),w=new Le(b,r,y);if(s.sparse!==void 0){const x=ui.SCALAR,v=wt[s.sparse.indices.componentType],S=s.sparse.indices.byteOffset||0,C=s.sparse.values.byteOffset||0,P=new v(o[1],S,s.sparse.count*x),L=new l(o[2],C,s.sparse.count*r);a!==null&&(w=new Le(w.array.slice(),w.itemSize,w.normalized));for(let M=0,_=P.length;M<_;M++){const U=P[M];if(w.setX(U,L[M*r]),r>=2&&w.setY(U,L[M*r+1]),r>=3&&w.setZ(U,L[M*r+2]),r>=4&&w.setW(U,L[M*r+3]),r>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}}return w})}loadTexture(e){const t=this.json,i=this.options,n=t.textures[e].source,o=t.images[n];let a=this.textureLoader;if(o.uri){const r=i.manager.getHandler(o.uri);r!==null&&(a=r)}return this.loadTextureImage(e,n,a)}loadTextureImage(e,t,i){const s=this,n=this.json,o=n.textures[e],a=n.images[t],r=(a.uri||a.bufferView)+":"+o.sampler;if(this.textureCache[r])return this.textureCache[r];const l=this.loadImageSource(t,i).then(function(d){d.flipY=!1,d.name=o.name||a.name||"",d.name===""&&typeof a.uri=="string"&&a.uri.startsWith("data:image/")===!1&&(d.name=a.uri);const h=(n.samplers||{})[o.sampler]||{};return d.magFilter=os[h.magFilter]||_s,d.minFilter=os[h.minFilter]||Rs,d.wrapS=as[h.wrapS]||me,d.wrapT=as[h.wrapT]||me,s.associations.set(d,{textures:e}),d}).catch(function(){return null});return this.textureCache[r]=l,l}loadImageSource(e,t){const i=this,s=this.json,n=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(c=>c.clone());const o=s.images[e],a=self.URL||self.webkitURL;let r=o.uri||"",l=!1;if(o.bufferView!==void 0)r=i.getDependency("bufferView",o.bufferView).then(function(c){l=!0;const h=new Blob([c],{type:o.mimeType});return r=a.createObjectURL(h),r});else if(o.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");const d=Promise.resolve(r).then(function(c){return new Promise(function(h,u){let y=h;t.isImageBitmapLoader===!0&&(y=function(b){const w=new Gt(b);w.needsUpdate=!0,h(w)}),t.load(bt.resolveURL(c,n.path),y,void 0,u)})}).then(function(c){return l===!0&&a.revokeObjectURL(r),c.userData.mimeType=o.mimeType||yo(o.uri),c}).catch(function(c){throw console.error("THREE.GLTFLoader: Couldn't load texture",r),c});return this.sourceCache[e]=d,d}assignTexture(e,t,i,s){const n=this;return this.getDependency("texture",i.index).then(function(o){if(!o)return null;if(i.texCoord!==void 0&&i.texCoord>0&&(o=o.clone(),o.channel=i.texCoord),n.extensions[D.KHR_TEXTURE_TRANSFORM]){const a=i.extensions!==void 0?i.extensions[D.KHR_TEXTURE_TRANSFORM]:void 0;if(a){const r=n.associations.get(o);o=n.extensions[D.KHR_TEXTURE_TRANSFORM].extendTexture(o,a),n.associations.set(o,r)}}return s!==void 0&&(o.colorSpace=s),e[t]=o,o})}assignFinalMaterial(e){const t=e.geometry;let i=e.material;const s=t.attributes.tangent===void 0,n=t.attributes.color!==void 0,o=t.attributes.normal===void 0;if(e.isPoints){const a="PointsMaterial:"+i.uuid;let r=this.cache.get(a);r||(r=new zi,hi.prototype.copy.call(r,i),r.color.copy(i.color),r.map=i.map,r.sizeAttenuation=!1,this.cache.add(a,r)),i=r}else if(e.isLine){const a="LineBasicMaterial:"+i.uuid;let r=this.cache.get(a);r||(r=new ai,hi.prototype.copy.call(r,i),r.color.copy(i.color),r.map=i.map,this.cache.add(a,r)),i=r}if(s||n||o){let a="ClonedMaterial:"+i.uuid+":";s&&(a+="derivative-tangents:"),n&&(a+="vertex-colors:"),o&&(a+="flat-shading:");let r=this.cache.get(a);r||(r=i.clone(),n&&(r.vertexColors=!0),o&&(r.flatShading=!0),s&&(r.normalScale&&(r.normalScale.y*=-1),r.clearcoatNormalScale&&(r.clearcoatNormalScale.y*=-1)),this.cache.add(a,r),this.associations.set(r,this.associations.get(i))),i=r}e.material=i}getMaterialType(){return T}loadMaterial(e){const t=this,i=this.json,s=this.extensions,n=i.materials[e];let o;const a={},r=n.extensions||{},l=[];if(r[D.KHR_MATERIALS_UNLIT]){const c=s[D.KHR_MATERIALS_UNLIT];o=c.getMaterialType(),l.push(c.extendParams(a,n,t))}else{const c=n.pbrMetallicRoughness||{};if(a.color=new B(1,1,1),a.opacity=1,Array.isArray(c.baseColorFactor)){const h=c.baseColorFactor;a.color.setRGB(h[0],h[1],h[2],Fe),a.opacity=h[3]}c.baseColorTexture!==void 0&&l.push(t.assignTexture(a,"map",c.baseColorTexture,ue)),a.metalness=c.metallicFactor!==void 0?c.metallicFactor:1,a.roughness=c.roughnessFactor!==void 0?c.roughnessFactor:1,c.metallicRoughnessTexture!==void 0&&(l.push(t.assignTexture(a,"metalnessMap",c.metallicRoughnessTexture)),l.push(t.assignTexture(a,"roughnessMap",c.metallicRoughnessTexture))),o=this._invokeOne(function(h){return h.getMaterialType&&h.getMaterialType(e)}),l.push(Promise.all(this._invokeAll(function(h){return h.extendMaterialParams&&h.extendMaterialParams(e,a)})))}n.doubleSided===!0&&(a.side=Hi);const d=n.alphaMode||mi.OPAQUE;if(d===mi.BLEND?(a.transparent=!0,a.depthWrite=!1):(a.transparent=!1,d===mi.MASK&&(a.alphaTest=n.alphaCutoff!==void 0?n.alphaCutoff:.5)),n.normalTexture!==void 0&&o!==Ke&&(l.push(t.assignTexture(a,"normalMap",n.normalTexture)),a.normalScale=new le(1,1),n.normalTexture.scale!==void 0)){const c=n.normalTexture.scale;a.normalScale.set(c,c)}if(n.occlusionTexture!==void 0&&o!==Ke&&(l.push(t.assignTexture(a,"aoMap",n.occlusionTexture)),n.occlusionTexture.strength!==void 0&&(a.aoMapIntensity=n.occlusionTexture.strength)),n.emissiveFactor!==void 0&&o!==Ke){const c=n.emissiveFactor;a.emissive=new B().setRGB(c[0],c[1],c[2],Fe)}return n.emissiveTexture!==void 0&&o!==Ke&&l.push(t.assignTexture(a,"emissiveMap",n.emissiveTexture,ue)),Promise.all(l).then(function(){const c=new o(a);return n.name&&(c.name=n.name),Ye(c,n),t.associations.set(c,{materials:e}),n.extensions&&st(s,c,n),c})}createUniqueName(e){const t=Ht.sanitizeNodeName(e||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){const t=this,i=this.extensions,s=this.primitiveCache;function n(a){return i[D.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(a,t).then(function(r){return rs(r,a,t)})}const o=[];for(let a=0,r=e.length;a<r;a++){const l=e[a],d=go(l),c=s[d];if(c)o.push(c.promise);else{let h;l.extensions&&l.extensions[D.KHR_DRACO_MESH_COMPRESSION]?h=n(l):h=rs(new Oe,l,t),s[d]={primitive:l,promise:h},o.push(h)}}return Promise.all(o)}loadMesh(e){const t=this,i=this.json,s=this.extensions,n=i.meshes[e],o=n.primitives,a=[];for(let r=0,l=o.length;r<l;r++){const d=o[r].material===void 0?uo(this.cache):this.getDependency("material",o[r].material);a.push(d)}return a.push(t.loadGeometries(o)),Promise.all(a).then(function(r){const l=r.slice(0,r.length-1),d=r[r.length-1],c=[];for(let u=0,y=d.length;u<y;u++){const b=d[u],w=o[u];let x;const v=l[u];if(w.mode===we.TRIANGLES||w.mode===we.TRIANGLE_STRIP||w.mode===we.TRIANGLE_FAN||w.mode===void 0)x=n.isSkinnedMesh===!0?new Is(b,v):new f(b,v),x.isSkinnedMesh===!0&&x.normalizeSkinWeights(),w.mode===we.TRIANGLE_STRIP?x.geometry=ss(x.geometry,Ls):w.mode===we.TRIANGLE_FAN&&(x.geometry=ss(x.geometry,Li));else if(w.mode===we.LINES)x=new Os(b,v);else if(w.mode===we.LINE_STRIP)x=new Me(b,v);else if(w.mode===we.LINE_LOOP)x=new xn(b,v);else if(w.mode===we.POINTS)x=new Ui(b,v);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+w.mode);Object.keys(x.geometry.morphAttributes).length>0&&fo(x,n),x.name=t.createUniqueName(n.name||"mesh_"+e),Ye(x,n),w.extensions&&st(s,x,w),t.assignFinalMaterial(x),c.push(x)}for(let u=0,y=c.length;u<y;u++)t.associations.set(c[u],{meshes:e,primitives:u});if(c.length===1)return n.extensions&&st(s,c[0],n),c[0];const h=new A;n.extensions&&st(s,h,n),t.associations.set(h,{meshes:e});for(let u=0,y=c.length;u<y;u++)h.add(c[u]);return h})}loadCamera(e){let t;const i=this.json.cameras[e],s=i[i.type];if(!s){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return i.type==="perspective"?t=new qt(R.radToDeg(s.yfov),s.aspectRatio||1,s.znear||1,s.zfar||2e6):i.type==="orthographic"&&(t=new qi(-s.xmag,s.xmag,s.ymag,-s.ymag,s.znear,s.zfar)),i.name&&(t.name=this.createUniqueName(i.name)),Ye(t,i),Promise.resolve(t)}loadSkin(e){const t=this.json.skins[e],i=[];for(let s=0,n=t.joints.length;s<n;s++)i.push(this._loadNodeShallow(t.joints[s]));return t.inverseBindMatrices!==void 0?i.push(this.getDependency("accessor",t.inverseBindMatrices)):i.push(null),Promise.all(i).then(function(s){const n=s.pop(),o=s,a=[],r=[];for(let l=0,d=o.length;l<d;l++){const c=o[l];if(c){a.push(c);const h=new N;n!==null&&h.fromArray(n.array,l*16),r.push(h)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[l])}return new Fs(a,r)})}loadAnimation(e){const t=this.json,i=this,s=t.animations[e],n=s.name?s.name:"animation_"+e,o=[],a=[],r=[],l=[],d=[];for(let c=0,h=s.channels.length;c<h;c++){const u=s.channels[c],y=s.samplers[u.sampler],b=u.target,w=b.node,x=s.parameters!==void 0?s.parameters[y.input]:y.input,v=s.parameters!==void 0?s.parameters[y.output]:y.output;b.node!==void 0&&(o.push(this.getDependency("node",w)),a.push(this.getDependency("accessor",x)),r.push(this.getDependency("accessor",v)),l.push(y),d.push(b))}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(r),Promise.all(l),Promise.all(d)]).then(function(c){const h=c[0],u=c[1],y=c[2],b=c[3],w=c[4],x=[];for(let v=0,S=h.length;v<S;v++){const C=h[v],P=u[v],L=y[v],M=b[v],_=w[v];if(C===void 0)continue;C.updateMatrix&&C.updateMatrix();const U=i._createAnimationTracks(C,P,L,M,_);if(U)for(let q=0;q<U.length;q++)x.push(U[q])}return new Ds(n,void 0,x)})}createNodeMesh(e){const t=this.json,i=this,s=t.nodes[e];return s.mesh===void 0?null:i.getDependency("mesh",s.mesh).then(function(n){const o=i._getNodeRef(i.meshCache,s.mesh,n);return s.weights!==void 0&&o.traverse(function(a){if(a.isMesh)for(let r=0,l=s.weights.length;r<l;r++)a.morphTargetInfluences[r]=s.weights[r]}),o})}loadNode(e){const t=this.json,i=this,s=t.nodes[e],n=i._loadNodeShallow(e),o=[],a=s.children||[];for(let l=0,d=a.length;l<d;l++)o.push(i.getDependency("node",a[l]));const r=s.skin===void 0?Promise.resolve(null):i.getDependency("skin",s.skin);return Promise.all([n,Promise.all(o),r]).then(function(l){const d=l[0],c=l[1],h=l[2];h!==null&&d.traverse(function(u){u.isSkinnedMesh&&u.bind(h,bo)});for(let u=0,y=c.length;u<y;u++)d.add(c[u]);return d})}_loadNodeShallow(e){const t=this.json,i=this.extensions,s=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];const n=t.nodes[e],o=n.name?s.createUniqueName(n.name):"",a=[],r=s._invokeOne(function(l){return l.createNodeMesh&&l.createNodeMesh(e)});return r&&a.push(r),n.camera!==void 0&&a.push(s.getDependency("camera",n.camera).then(function(l){return s._getNodeRef(s.cameraCache,n.camera,l)})),s._invokeAll(function(l){return l.createNodeAttachment&&l.createNodeAttachment(e)}).forEach(function(l){a.push(l)}),this.nodeCache[e]=Promise.all(a).then(function(l){let d;if(n.isBone===!0?d=new Ri:l.length>1?d=new A:l.length===1?d=l[0]:d=new Ze,d!==l[0])for(let c=0,h=l.length;c<h;c++)d.add(l[c]);if(n.name&&(d.userData.name=n.name,d.name=o),Ye(d,n),n.extensions&&st(i,d,n),n.matrix!==void 0){const c=new N;c.fromArray(n.matrix),d.applyMatrix4(c)}else n.translation!==void 0&&d.position.fromArray(n.translation),n.rotation!==void 0&&d.quaternion.fromArray(n.rotation),n.scale!==void 0&&d.scale.fromArray(n.scale);return s.associations.has(d)||s.associations.set(d,{}),s.associations.get(d).nodes=e,d}),this.nodeCache[e]}loadScene(e){const t=this.extensions,i=this.json.scenes[e],s=this,n=new A;i.name&&(n.name=s.createUniqueName(i.name)),Ye(n,i),i.extensions&&st(t,n,i);const o=i.nodes||[],a=[];for(let r=0,l=o.length;r<l;r++)a.push(s.getDependency("node",o[r]));return Promise.all(a).then(function(r){for(let d=0,c=r.length;d<c;d++)n.add(r[d]);const l=d=>{const c=new Map;for(const[h,u]of s.associations)(h instanceof hi||h instanceof Gt)&&c.set(h,u);return d.traverse(h=>{const u=s.associations.get(h);u!=null&&c.set(h,u)}),c};return s.associations=l(n),n})}_createAnimationTracks(e,t,i,s,n){const o=[],a=e.name?e.name:e.uuid,r=[];He[n.path]===He.weights?e.traverse(function(h){h.morphTargetInfluences&&r.push(h.name?h.name:h.uuid)}):r.push(a);let l;switch(He[n.path]){case He.weights:l=Ii;break;case He.rotation:l=ni;break;case He.position:case He.scale:l=_i;break;default:switch(i.itemSize){case 1:l=Ii;break;case 2:case 3:default:l=_i;break}break}const d=s.interpolation!==void 0?po[s.interpolation]:Gs,c=this._getArrayFromAccessor(i);for(let h=0,u=r.length;h<u;h++){const y=new l(r[h]+"."+He[n.path],t.array,c,d);s.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(y),o.push(y)}return o}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){const i=Fi(t.constructor),s=new Float32Array(t.length);for(let n=0,o=t.length;n<o;n++)s[n]=t[n]*i;t=s}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(i){const s=this instanceof ni?ho:$s;return new s(this.times,this.values,this.getValueSize()/3,i)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function xo(p,e,t){const i=e.attributes,s=new Cn;if(i.POSITION!==void 0){const a=t.json.accessors[i.POSITION],r=a.min,l=a.max;if(r!==void 0&&l!==void 0){if(s.set(new m(r[0],r[1],r[2]),new m(l[0],l[1],l[2])),a.normalized){const d=Fi(wt[a.componentType]);s.min.multiplyScalar(d),s.max.multiplyScalar(d)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;const n=e.targets;if(n!==void 0){const a=new m,r=new m;for(let l=0,d=n.length;l<d;l++){const c=n[l];if(c.POSITION!==void 0){const h=t.json.accessors[c.POSITION],u=h.min,y=h.max;if(u!==void 0&&y!==void 0){if(r.setX(Math.max(Math.abs(u[0]),Math.abs(y[0]))),r.setY(Math.max(Math.abs(u[1]),Math.abs(y[1]))),r.setZ(Math.max(Math.abs(u[2]),Math.abs(y[2]))),h.normalized){const b=Fi(wt[h.componentType]);r.multiplyScalar(b)}a.max(r)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}s.expandByVector(a)}p.boundingBox=s;const o=new En;s.getCenter(o.center),o.radius=s.min.distanceTo(s.max)/2,p.boundingSphere=o}function rs(p,e,t){const i=e.attributes,s=[];function n(o,a){return t.getDependency("accessor",o).then(function(r){p.setAttribute(a,r)})}for(const o in i){const a=Oi[o]||o.toLowerCase();a in p.attributes||s.push(n(i[o],a))}if(e.indices!==void 0&&!p.index){const o=t.getDependency("accessor",e.indices).then(function(a){p.setIndex(a)});s.push(o)}return Ji.workingColorSpace!==Fe&&"COLOR_0"in i&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${Ji.workingColorSpace}" not supported.`),Ye(p,e),xo(p,e,t),Promise.all(s).then(function(){return e.targets!==void 0?mo(p,e.targets,t):p})}const vo=Object.freeze(Object.defineProperty({__proto__:null,GLTFLoader:Ut},Symbol.toStringTag,{value:"Module"}));class So{keys=new Set;justPressedKeys=new Set;gamepad=null;lastJumpPressTime=0;JUMP_BUFFER_MS=100;constructor(){this.initKeyboard(),this.initGamepad()}initKeyboard(){window.addEventListener("keydown",e=>{const t=e.target.tagName;t==="INPUT"||t==="TEXTAREA"||(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","ControlLeft","ControlRight"].includes(e.code)&&e.preventDefault(),this.keys.has(e.code)||(this.justPressedKeys.add(e.code),e.code==="Space"&&(this.lastJumpPressTime=performance.now())),this.keys.add(e.code))}),window.addEventListener("keyup",e=>{const t=e.target.tagName;t==="INPUT"||t==="TEXTAREA"||this.keys.delete(e.code)}),window.addEventListener("blur",()=>{this.keys.clear(),this.justPressedKeys.clear()})}initGamepad(){window.addEventListener("gamepadconnected",e=>{console.log("Gamepad connected:",e.gamepad.id),this.gamepad=e.gamepad}),window.addEventListener("gamepaddisconnected",()=>{console.log("Gamepad disconnected"),this.gamepad=null})}update(){const e=navigator.getGamepads();e[0]&&(this.gamepad=e[0])}clearJustPressed(){this.justPressedKeys.clear()}justPressed(e){return this.justPressedKeys.has(e)}isHeld(e){return this.keys.has(e)}getState(){const e={forward:this.isHeld("KeyW"),brake:this.isHeld("KeyS"),turnLeft:this.isHeld("KeyA"),turnRight:this.isHeld("KeyD"),jump:this.justPressed("Space"),jumpHeld:this.isHeld("Space"),flip:this.isHeld("ArrowLeft"),grab:this.isHeld("ArrowRight"),grind:this.isHeld("ArrowUp"),trickUp:this.isHeld("KeyW"),trickDown:this.isHeld("KeyS"),trickLeft:this.isHeld("KeyA"),trickRight:this.isHeld("KeyD"),spinLeft:this.isHeld("KeyQ"),spinRight:this.isHeld("KeyE"),revert:this.justPressed("ControlLeft")||this.justPressed("ControlRight"),pause:this.justPressed("Escape")};return this.gamepad?this.mergeGamepad(e,this.gamepad):e}isJumpBuffered(){return performance.now()-this.lastJumpPressTime<this.JUMP_BUFFER_MS}clearJumpBuffer(){this.lastJumpPressTime=0}mergeGamepad(e,t){const i=t.axes[0]||0,s=t.axes[1]||0,n=.25,o=a=>t.buttons[a]?.pressed??!1;return{forward:e.forward||s<-n,brake:e.brake||s>n,turnLeft:e.turnLeft||i<-n,turnRight:e.turnRight||i>n,jump:e.jump||o(0),jumpHeld:e.jumpHeld||o(0),flip:e.flip||o(2),grab:e.grab||o(1),grind:e.grind||o(3),trickUp:e.trickUp||o(12),trickDown:e.trickDown||o(13),trickLeft:e.trickLeft||o(14),trickRight:e.trickRight||o(15),spinLeft:e.spinLeft||o(4),spinRight:e.spinRight||o(5),revert:e.revert||o(6)||o(7),pause:e.pause||o(9)}}}class To{world;initialized=!1;staticBodies=[];async init(){this.initialized||(console.log("Initializing Rapier physics..."),await V.init(),console.log("Rapier initialized!"),this.world=new V.World({x:0,y:-30,z:0}),this.initialized=!0)}createChairBody(e){const t=V.RigidBodyDesc.dynamic().setTranslation(e.x,2,e.z).setLinearDamping(.03).setAngularDamping(8).enabledRotations(!1,!0,!1),i=this.world.createRigidBody(t),s=V.ColliderDesc.capsule(.3,.4).setMass(50).setFriction(.1).setRestitution(0);return this.world.createCollider(s,i),i}createGround(e=50){const t=V.RigidBodyDesc.fixed().setTranslation(0,-.5,0),i=this.world.createRigidBody(t),s=V.ColliderDesc.cuboid(e,.5,e).setFriction(.5).setRestitution(0);this.world.createCollider(s,i);const n=5,o=1;this.createWall(0,n/2,e+o,e,n,o),this.createWall(0,n/2,-e-o,e,n,o),this.createWall(e+o,n/2,0,o,n,e),this.createWall(-e-o,n/2,0,o,n,e)}createWall(e,t,i,s,n,o){const a=V.RigidBodyDesc.fixed().setTranslation(e,t,i),r=this.world.createRigidBody(a),l=V.ColliderDesc.cuboid(s,n,o).setFriction(.3).setRestitution(.3);this.world.createCollider(l,r)}createStaticBox(e,t,i){const s=V.RigidBodyDesc.fixed().setTranslation(e.x,e.y,e.z);if(i){const a=new G().setFromEuler(i);s.setRotation({x:a.x,y:a.y,z:a.z,w:a.w})}const n=this.world.createRigidBody(s),o=V.ColliderDesc.cuboid(t.x,t.y,t.z).setFriction(.2);return this.world.createCollider(o,n),this.staticBodies.push(n),n}createStaticCylinder(e,t,i,s){const n=V.RigidBodyDesc.fixed().setTranslation(e.x,e.y,e.z);if(s){const r=new G().setFromEuler(s);n.setRotation({x:r.x,y:r.y,z:r.z,w:r.w})}const o=this.world.createRigidBody(n),a=V.ColliderDesc.cylinder(t,i).setFriction(.2);return this.world.createCollider(a,o),this.staticBodies.push(o),o}createStaticSphere(e,t){const i=V.RigidBodyDesc.fixed().setTranslation(e.x,e.y,e.z),s=this.world.createRigidBody(i),n=V.ColliderDesc.ball(t).setFriction(.2);return this.world.createCollider(n,s),this.staticBodies.push(s),s}createStaticCone(e,t,i){const s=V.RigidBodyDesc.fixed().setTranslation(e.x,e.y,e.z),n=this.world.createRigidBody(s),o=V.ColliderDesc.cone(t,i).setFriction(.2);return this.world.createCollider(o,n),this.staticBodies.push(n),n}createCompoundBody(e,t){const i=V.RigidBodyDesc.fixed().setTranslation(e.x,e.y,e.z);if(t){const n=new G().setFromEuler(t);i.setRotation({x:n.x,y:n.y,z:n.z,w:n.w})}const s=this.world.createRigidBody(i);return this.staticBodies.push(s),s}addBoxCollider(e,t,i,s){const n=V.ColliderDesc.cuboid(i.x,i.y,i.z).setTranslation(t.x,t.y,t.z).setFriction(.2);if(s){const o=new G().setFromEuler(s);n.setRotation({x:o.x,y:o.y,z:o.z,w:o.w})}this.world.createCollider(n,e)}addCylinderCollider(e,t,i,s,n){const o=V.ColliderDesc.cylinder(i,s).setTranslation(t.x,t.y,t.z).setFriction(.2);if(n){const a=new G().setFromEuler(n);o.setRotation({x:a.x,y:a.y,z:a.z,w:a.w})}this.world.createCollider(o,e)}createStaticRamp(e,t,i,s,n){const o=V.RigidBodyDesc.fixed().setTranslation(e.x,e.y,e.z);if(n){const c=new G().setFromEuler(n);o.setRotation({x:c.x,y:c.y,z:c.z,w:c.w})}const a=this.world.createRigidBody(o),r=new Float32Array([-t/2,0,0,t/2,0,0,t/2,i,s,-t/2,i,s,-t/2,0,s,t/2,0,s]),l=new Uint32Array([0,1,2,0,2,3,4,5,1,4,1,0,3,2,5,3,5,4,0,3,4,1,5,2,0,4,5,0,5,1]),d=V.ColliderDesc.trimesh(r,l).setFriction(.3);return this.world.createCollider(d,a),this.staticBodies.push(a),a}createQuarterPipeCollider(e,t,i,s=8,n){const o=V.RigidBodyDesc.fixed().setTranslation(e.x,e.y,e.z);if(n){const c=new G().setFromEuler(n);o.setRotation({x:c.x,y:c.y,z:c.z,w:c.w})}const a=this.world.createRigidBody(o),r=[],l=[];for(let c=0;c<=s;c++){const h=c/s*Math.PI/2,u=t-Math.cos(h)*t,y=Math.sin(h)*t;r.push(-i/2,y,u),r.push(i/2,y,u)}for(let c=0;c<s;c++){const h=c*2,u=c*2+1,y=(c+1)*2,b=(c+1)*2+1;l.push(h,u,b),l.push(h,b,y)}const d=V.ColliderDesc.trimesh(new Float32Array(r),new Uint32Array(l)).setFriction(.3);return this.world.createCollider(d,a),this.staticBodies.push(a),a}clearStaticBodies(){for(const e of this.staticBodies)this.world.removeRigidBody(e);this.staticBodies=[]}step(e){this.world.timestep=e,this.world.step()}getPosition(e){const t=e.translation();return new m(t.x,t.y,t.z)}getRotation(e){const t=e.rotation();return new G(t.x,t.y,t.z,t.w)}applyForce(e,t){e.addForce({x:t.x,y:t.y,z:t.z},!0)}applyImpulse(e,t){e.applyImpulse({x:t.x,y:t.y,z:t.z},!0)}applyTorque(e,t){e.addTorque({x:t.x,y:t.y,z:t.z},!0)}getVelocity(e){const t=e.linvel();return new m(t.x,t.y,t.z)}setVelocity(e,t){e.setLinvel({x:t.x,y:t.y,z:t.z},!0)}setPosition(e,t){e.setTranslation({x:t.x,y:t.y,z:t.z},!0)}setRotationY(e,t){const i=new G().setFromAxisAngle(new m(0,1,0),t);e.setRotation({x:i.x,y:i.y,z:i.z,w:i.w},!0)}getAngularVelocity(e){const t=e.angvel();return new m(t.x,t.y,t.z)}setAngularVelocity(e,t){e.setAngvel({x:t.x,y:t.y,z:t.z},!0)}raycastGround(e,t=2){if(!this.initialized)return null;const i={x:e.x,y:e.y,z:e.z},s={x:0,y:-1,z:0},n=new V.Ray(i,s),o=this.world.castRay(n,t,!0);if(o){const a=o.toi,r=n.pointAt(a),l=o.collider.castRayAndGetNormal(n,t,!0);let d=new m(0,1,0);return l&&(d=new m(l.normal.x,l.normal.y,l.normal.z)),{hit:!0,distance:a,point:new m(r.x,r.y,r.z),normal:d}}return null}checkAndResolvePenetration(e,t=.5){if(!this.initialized)return null;const i=e.translation(),s=e.linvel();if(Math.sqrt(s.x*s.x+s.z*s.z)>3)return null;const o=new m;let a=0,r=0;const l=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1},{x:.707,z:.707},{x:.707,z:-.707},{x:-.707,z:.707},{x:-.707,z:-.707}],d=[],c=t*.3;for(let u=0;u<l.length;u++){const y=l[u],b=new V.Ray({x:i.x,y:i.y+.5,z:i.z},{x:y.x,y:0,z:y.z}),w=this.world.castRay(b,t,!0);if(w&&w.toi<c){const x=c-w.toi,v=x/c;o.x-=y.x*v,o.z-=y.z*v,a++,r+=x,d.push(u)}}const h=d.includes(0)&&d.includes(1)||d.includes(2)&&d.includes(3)||d.includes(4)&&d.includes(7)||d.includes(5)&&d.includes(6);if(a>=2&&h){const u=Math.min(1,r/c);return o.length()<.3?o.set(0,1,0):o.normalize(),{direction:o,severity:u,betweenObjects:h}}return null}applySeparation(e,t,i=5){const s=e.linvel();if(t.y>.5){const n=new m(s.x*.5,Math.max(s.y,i),s.z*.5);e.setLinvel({x:n.x,y:n.y,z:n.z},!0)}else{const n=new m(s.x+t.x*i,s.y,s.z+t.z*i);e.setLinvel({x:n.x,y:n.y,z:n.z},!0)}}emergencyUnstuck(e){const t=e.translation();e.setTranslation({x:t.x,y:t.y+1.5,z:t.z},!0),e.setLinvel({x:0,y:2,z:0},!0)}raycastGroundMulti(e,t=.3,i=2){const s=[new m(0,0,0),new m(t,0,0),new m(-t,0,0),new m(0,0,t),new m(0,0,-t)];let n=null,o=1/0;const a=[];for(const c of s){const h=e.clone().add(c),u=this.raycastGround(h,i);u&&u.distance<o&&(o=u.distance,n=u),u&&a.push(u.normal)}if(!n)return null;const r=new m;for(const c of a)r.add(c);r.divideScalar(a.length).normalize();const l=new m(0,1,0),d=R.radToDeg(Math.acos(r.dot(l)));return{hit:!0,distance:n.distance,point:n.point,normal:r,surfaceAngle:d}}getSurfaceMovementDirection(e,t){const i=new m(0,1,0);if(t.dot(i)>.99)return e.clone();const s=new m().crossVectors(t,e).normalize();return new m().crossVectors(s,t).normalize()}}class ko{rails=[];grindState={isGrinding:!1,rail:null,progress:0,direction:1,balance:.5,speed:0,entrySpeed:0};grindCooldown=0;GRIND_COOLDOWN_TIME=.8;SNAP_DISTANCE=.6;SNAP_HEIGHT_TOLERANCE=.4;MIN_SPEED_TO_GRIND=2.5;GRIND_FRICTION=.995;BALANCE_DRIFT=.08;BALANCE_CORRECTION=4;RAIL_HEIGHT=.8;MIN_GRIND_SPEED=3;clearRails(){this.rails=[],this.forceEndGrind()}addRail(e,t,i,s){const n=new m().subVectors(t,e).normalize(),o=e.distanceTo(t),a={id:i||`rail_${this.rails.length}`,start:e.clone(),end:t.clone(),direction:n,length:o,mesh:s};return this.rails.push(a),a}updateCooldown(e){this.grindCooldown>0&&(this.grindCooldown-=e)}tryStartGrind(e,t,i=!0){if(this.grindState.isGrinding||this.grindCooldown>0)return null;const s=new m(t.x,0,t.z).length();if(s<this.MIN_SPEED_TO_GRIND)return null;let n=null,o=this.SNAP_DISTANCE,a=0;for(const r of this.rails){const l=this.getClosestPointOnRail(e,r),d=new le(e.x-l.point.x,e.z-l.point.z).length(),c=Math.abs(e.y-this.RAIL_HEIGHT);d<o&&c<this.SNAP_HEIGHT_TOLERANCE&&(o=d,n=r,a=l.progress)}if(n){const l=new m(t.x,0,t.z).normalize().dot(n.direction);return this.grindState={isGrinding:!0,rail:n,progress:a,direction:l>=0?1:-1,balance:.5,speed:s,entrySpeed:s},n}return null}updateGrind(e,t,i,s,n=1){if(!this.grindState.isGrinding||!this.grindState.rail)return null;const o=this.grindState.rail;this.grindState.speed*=this.GRIND_FRICTION,this.grindState.speed<this.MIN_GRIND_SPEED&&(this.grindState.speed=this.MIN_GRIND_SPEED);const a=this.grindState.speed*e/o.length*this.grindState.direction;if(this.grindState.progress+=a,this.grindState.progress<0||this.grindState.progress>1)return this.endGrind(i,s);const r=(Math.random()-.5)*this.BALANCE_DRIFT*e*n;if(this.grindState.balance+=r,this.grindState.balance+=t*this.BALANCE_CORRECTION*e,this.grindState.balance=Math.max(0,Math.min(1,this.grindState.balance)),this.grindState.balance<.1||this.grindState.balance>.9)return this.bailFromGrind(i,s);const l=new m().lerpVectors(o.start,o.end,this.grindState.progress);l.y=this.RAIL_HEIGHT+.3;const d=o.direction.clone().multiplyScalar(this.grindState.speed*this.grindState.direction);i.setPosition(s,l),i.setVelocity(s,d);const c=Math.atan2(o.direction.x*this.grindState.direction,o.direction.z*this.grindState.direction);return i.setRotationY(s,c),{position:l,velocity:d}}endGrind(e,t){const i=this.grindState.rail,s=this.grindState.progress>1?i.end.clone():i.start.clone();s.y=this.RAIL_HEIGHT+.3;const n=i.direction.clone().multiplyScalar(this.grindState.speed*this.grindState.direction);return n.y=3,this.resetGrindState(),e.setPosition(t,s),e.setVelocity(t,n),{position:s,velocity:n}}bailFromGrind(e,t){const i=this.grindState.rail,s=new m().lerpVectors(i.start,i.end,this.grindState.progress);s.y=this.RAIL_HEIGHT;const n=new m().crossVectors(i.direction,new m(0,1,0)).normalize(),o=this.grindState.balance<.5?-1:1,a=n.clone().multiplyScalar(3*o);return a.y=2,this.resetGrindState(),e.setVelocity(t,a),{position:s,velocity:a}}resetGrindState(){this.grindState={isGrinding:!1,rail:null,progress:0,direction:1,balance:.5,speed:0,entrySpeed:0},this.grindCooldown=this.GRIND_COOLDOWN_TIME}getClosestPointOnRail(e,t){const i=new m().subVectors(e,t.start),s=new m().subVectors(t.end,t.start),n=Math.max(0,Math.min(1,i.dot(s)/s.lengthSq()));return{point:new m().lerpVectors(t.start,t.end,n),progress:n}}getState(){return{...this.grindState}}isGrinding(){return this.grindState.isGrinding}forceEndGrind(){this.resetGrindState()}getRails(){return this.rails}}class Co{camera;target=null;offset=new m(0,3,-5);lookAhead=1.5;smoothSpeed=5;rotationSmooth=3;baseFOV=75;maxFOV=90;currentFOV=75;targetFOV=75;fovSmoothSpeed=4;trickZoomAmount=.15;targetZoomMultiplier=1;currentZoomMultiplier=1;zoomSmoothSpeed=6;currentOffset=new m;currentLookAt=new m;shakeIntensity=0;shakeDuration=0;shakeTimeRemaining=0;shakeOffset=new m;isDragging=!1;orbitAngleX=0;orbitAngleY=0;targetOrbitX=0;targetOrbitY=0;lastMouseX=0;lastMouseY=0;orbitSensitivity=.005;orbitReturnSpeed=2;maxOrbitY=Math.PI/3;minOrbitY=-Math.PI/6;constructor(e){this.camera=e,this.currentOffset.copy(this.offset)}setupMouseControls(e){e.addEventListener("mousedown",t=>{(t.button===0||t.button===2)&&(this.isDragging=!0,this.lastMouseX=t.clientX,this.lastMouseY=t.clientY)}),e.addEventListener("mouseup",()=>{this.isDragging=!1}),e.addEventListener("mouseleave",()=>{this.isDragging=!1}),e.addEventListener("mousemove",t=>{if(!this.isDragging)return;const i=t.clientX-this.lastMouseX,s=t.clientY-this.lastMouseY;this.targetOrbitX+=i*this.orbitSensitivity,this.targetOrbitY+=s*this.orbitSensitivity,this.targetOrbitY=Math.max(this.minOrbitY,Math.min(this.maxOrbitY,this.targetOrbitY)),this.lastMouseX=t.clientX,this.lastMouseY=t.clientY}),e.addEventListener("contextmenu",t=>t.preventDefault())}resetOrbit(){this.targetOrbitX=0,this.targetOrbitY=0}setTarget(e){this.target=e,e&&(this.currentLookAt.copy(e.position),this.camera.position.copy(e.position).add(this.offset))}update(e){if(!this.target)return;this.isDragging||(this.targetOrbitX*=1-this.orbitReturnSpeed*e,this.targetOrbitY*=1-this.orbitReturnSpeed*e),this.orbitAngleX+=(this.targetOrbitX-this.orbitAngleX)*5*e,this.orbitAngleY+=(this.targetOrbitY-this.orbitAngleY)*5*e;const t=new m(0,0,1);t.applyQuaternion(this.target.quaternion),this.currentZoomMultiplier+=(this.targetZoomMultiplier-this.currentZoomMultiplier)*this.zoomSmoothSpeed*e;const i=new m(0,this.offset.y*this.currentZoomMultiplier,this.offset.z*this.currentZoomMultiplier),s=new ne().setFromQuaternion(this.target.quaternion,"YXZ").y;i.applyAxisAngle(new m(0,1,0),s),i.applyAxisAngle(new m(0,1,0),this.orbitAngleX),this.updateGrindCamera(e),Math.abs(this.grindCameraAngle)>.001&&i.applyAxisAngle(new m(0,1,0),this.grindCameraAngle);const n=new m(-i.z,0,i.x).normalize();i.applyAxisAngle(n,this.orbitAngleY),this.currentOffset.lerp(i,this.rotationSmooth*e);const o=new m().copy(this.target.position).add(this.currentOffset);if(this.camera.position.lerp(o,this.smoothSpeed*e),this.shakeTimeRemaining>0){this.shakeTimeRemaining-=e;const d=this.shakeTimeRemaining/this.shakeDuration,c=this.shakeIntensity*d;this.shakeOffset.set((Math.random()-.5)*2*c,(Math.random()-.5)*2*c,(Math.random()-.5)*2*c),this.camera.position.add(this.shakeOffset)}const a=t.clone().multiplyScalar(this.lookAhead),r=new m().copy(this.target.position).add(new m(0,1,0)).add(a);this.currentLookAt.lerp(r,this.smoothSpeed*e),this.camera.lookAt(this.currentLookAt),this.updateImpactZoom(e);const l=this.targetFOV-this.impactZoomCurrent;this.currentFOV+=(l-this.currentFOV)*this.fovSmoothSpeed*e,this.camera.fov=this.currentFOV,this.camera.updateProjectionMatrix()}shake(e=.5,t=.3){e>this.shakeIntensity*(this.shakeTimeRemaining/this.shakeDuration)&&(this.shakeIntensity=e,this.shakeDuration=t,this.shakeTimeRemaining=t)}setZoom(e){this.offset.z=-8*e,this.offset.y=4*e}updateFOVFromSpeed(e,t=18){const i=Math.min(e/t,1),s=i*i;this.targetFOV=this.baseFOV+(this.maxFOV-this.baseFOV)*s}resetFOV(){this.targetFOV=this.baseFOV}setTrickZoom(e,t=0){if(e){const i=Math.min(t/.5,1),s=i*i;this.targetZoomMultiplier=1+this.trickZoomAmount*s}else this.targetZoomMultiplier=1}resetTrickZoom(){this.targetZoomMultiplier=1}impactZoomCurrent=0;impactZoomDecay=8;grindCameraAngle=0;targetGrindAngle=0;grindAngleMax=Math.PI/12;grindAngleSmoothSpeed=4;grindRailDirection=new m;impactZoomPulse(e){if(e<5e3)return;const i=5+Math.min((e-5e3)/45e3,1)*10;this.impactZoomCurrent=i}updateImpactZoom(e){this.impactZoomCurrent>.1?this.impactZoomCurrent-=this.impactZoomCurrent*this.impactZoomDecay*e:this.impactZoomCurrent=0}setGrindCamera(e,t,i){if(e&&t&&i){if(this.grindRailDirection.subVectors(i,t).normalize(),this.target){const s=new m(0,0,1);s.applyQuaternion(this.target.quaternion);const n=new m().crossVectors(s,this.grindRailDirection);this.targetGrindAngle=n.y>0?this.grindAngleMax:-this.grindAngleMax}}else this.targetGrindAngle=0}updateGrindCamera(e){this.grindCameraAngle+=(this.targetGrindAngle-this.grindCameraAngle)*this.grindAngleSmoothSpeed*e,Math.abs(this.grindCameraAngle)<.001&&Math.abs(this.targetGrindAngle)<.001&&(this.grindCameraAngle=0)}}const Di=[{id:"kickflip",name:"kickflip",displayName:"Kickflip",type:"flip",basePoints:500,duration:400,difficulty:1},{id:"heelflip",name:"heelflip",displayName:"Heelflip",type:"flip",basePoints:500,duration:400,difficulty:1},{id:"pop_shove",name:"pop_shove",displayName:"Pop Shove-It",type:"flip",basePoints:400,duration:350,difficulty:1},{id:"fs_shove",name:"fs_shove",displayName:"FS Shove-It",type:"flip",basePoints:400,duration:350,difficulty:1},{id:"360_flip",name:"360_flip",displayName:"360 Flip",type:"flip",basePoints:1e3,duration:500,difficulty:2},{id:"hardflip",name:"hardflip",displayName:"Hardflip",type:"flip",basePoints:800,duration:450,difficulty:2},{id:"varial_flip",name:"varial_flip",displayName:"Varial Kickflip",type:"flip",basePoints:700,duration:420,difficulty:2},{id:"impossible",name:"impossible",displayName:"Impossible",type:"flip",basePoints:900,duration:480,difficulty:2},{id:"swivel_flip",name:"swivel_flip",displayName:"Swivel Flip",type:"flip",basePoints:600,duration:400,difficulty:1},{id:"caster_kick",name:"caster_kick",displayName:"Caster Kick",type:"flip",basePoints:550,duration:380,difficulty:1},{id:"armrest_spin",name:"armrest_spin",displayName:"Armrest Spin",type:"flip",basePoints:750,duration:450,difficulty:2},{id:"melon",name:"melon",displayName:"Melon",type:"grab",basePoints:400,duration:0,difficulty:1},{id:"indy",name:"indy",displayName:"Indy",type:"grab",basePoints:400,duration:0,difficulty:1},{id:"nosegrab",name:"nosegrab",displayName:"Nosegrab",type:"grab",basePoints:450,duration:0,difficulty:1},{id:"tailgrab",name:"tailgrab",displayName:"Tailgrab",type:"grab",basePoints:450,duration:0,difficulty:1},{id:"benihana",name:"benihana",displayName:"Benihana",type:"grab",basePoints:600,duration:0,difficulty:2},{id:"madonna",name:"madonna",displayName:"Madonna",type:"grab",basePoints:700,duration:0,difficulty:2},{id:"airwalk",name:"airwalk",displayName:"Airwalk",type:"grab",basePoints:800,duration:0,difficulty:2},{id:"coffee_mug",name:"coffee_mug",displayName:"Coffee Mug Grab",type:"grab",basePoints:500,duration:0,difficulty:1},{id:"keyboard_clutch",name:"keyboard_clutch",displayName:"Keyboard Clutch",type:"grab",basePoints:550,duration:0,difficulty:1},{id:"monitor_hug",name:"monitor_hug",displayName:"Monitor Hug",type:"grab",basePoints:600,duration:0,difficulty:2},{id:"50_50",name:"50_50",displayName:"50-50",type:"grind",basePoints:300,duration:0,difficulty:1},{id:"nosegrind",name:"nosegrind",displayName:"Nosegrind",type:"grind",basePoints:400,duration:0,difficulty:1},{id:"tailslide",name:"tailslide",displayName:"Tailslide",type:"grind",basePoints:400,duration:0,difficulty:1},{id:"smith",name:"smith",displayName:"Smith Grind",type:"grind",basePoints:500,duration:0,difficulty:2},{id:"feeble",name:"feeble",displayName:"Feeble Grind",type:"grind",basePoints:500,duration:0,difficulty:2},{id:"crooked",name:"crooked",displayName:"Crooked Grind",type:"grind",basePoints:550,duration:0,difficulty:2},{id:"bluntslide",name:"bluntslide",displayName:"Bluntslide",type:"grind",basePoints:600,duration:0,difficulty:2},{id:"boardslide",name:"boardslide",displayName:"Boardslide",type:"grind",basePoints:350,duration:0,difficulty:1},{id:"manual",name:"manual",displayName:"Manual",type:"manual",basePoints:200,duration:0,difficulty:1},{id:"nose_manual",name:"nose_manual",displayName:"Nose Manual",type:"manual",basePoints:250,duration:0,difficulty:1},{id:"quarterly_report",name:"quarterly_report",displayName:"The Quarterly Report",type:"special",basePoints:5e3,duration:800,difficulty:3},{id:"golden_parachute",name:"golden_parachute",displayName:"Golden Parachute",type:"special",basePoints:4e3,duration:700,difficulty:3},{id:"hostile_takeover",name:"hostile_takeover",displayName:"Hostile Takeover",type:"special",basePoints:4500,duration:750,difficulty:3},{id:"pink_slip",name:"pink_slip",displayName:"Pink Slip",type:"special",basePoints:3e3,duration:500,difficulty:3}],Xs=new Map;for(const p of Di)Xs.set(p.id,p);const X={get(p){return Xs.get(p)},getAll(){return[...Di]},getByType(p){return Di.filter(e=>e.type===p)}};class Eo{lastTrickTime=0;minTrickInterval=200;detectTrick(e,t){const i=performance.now();if(i-this.lastTrickTime<this.minTrickInterval||!t.isAirborne)return null;let s=null;return e.flip?s=this.detectFlipTrick(e):e.grab&&(s=this.detectGrabTrick(e)),s&&(this.lastTrickTime=i),s}detectFlipTrick(e){return e.trickUp&&!e.trickDown&&!e.trickLeft&&!e.trickRight?X.get("impossible")||null:e.trickUp&&e.trickRight?X.get("hardflip")||null:e.trickRight&&!e.trickUp&&!e.trickDown?X.get("heelflip")||null:e.trickDown&&e.trickRight?X.get("varial_flip")||null:e.trickDown&&!e.trickLeft&&!e.trickRight?X.get("pop_shove")||null:e.trickDown&&e.trickLeft?X.get("360_flip")||null:e.trickLeft&&!e.trickUp&&!e.trickDown?X.get("kickflip")||null:e.trickUp&&e.trickLeft?X.get("hardflip")||null:X.get("kickflip")||null}detectGrabTrick(e){return e.trickUp&&!e.trickDown&&!e.trickLeft&&!e.trickRight?X.get("nosegrab")||null:e.trickUp&&e.trickRight?X.get("madonna")||null:e.trickRight&&!e.trickUp&&!e.trickDown?X.get("indy")||null:e.trickDown&&e.trickRight?X.get("airwalk")||null:e.trickDown&&!e.trickLeft&&!e.trickRight?X.get("tailgrab")||null:e.trickDown&&e.trickLeft?X.get("benihana")||null:e.trickLeft&&!e.trickUp&&!e.trickDown?X.get("melon")||null:e.trickUp&&e.trickLeft?X.get("coffee_mug")||null:X.get("indy")||null}detectGrindType(e,t){const i=(e%360+360)%360;return i<30||i>330?X.get("50_50")||null:i<60?X.get("nosegrind")||null:i>300?X.get("tailslide")||null:i<120?X.get("smith")||null:i>240?X.get("feeble")||null:X.get("boardslide")||null}}class Mo{currentTricks=[];multiplier=1;totalPoints=0;comboTimer=0;maxComboTime=2e3;isActive=!1;trickCounts=new Map;listeners=[];on(e){return this.listeners.push(e),()=>{this.listeners=this.listeners.filter(t=>t!==e)}}emit(e){for(const t of this.listeners)t(e)}addTrick(e){const t=this.trickCounts.get(e.id)||0;this.trickCounts.set(e.id,t+1);const i=Math.pow(.5,t),s=Math.floor(e.basePoints*i),n={trick:e,points:s,timestamp:performance.now()};this.currentTricks.push(n),this.totalPoints+=s,this.multiplier=this.currentTricks.length+1,this.comboTimer=this.maxComboTime,this.isActive=!0,this.emit({type:"trick_added",trick:e,points:s,multiplier:this.multiplier,totalScore:this.getPotentialScore()}),this.emit({type:"multiplier_changed",multiplier:this.multiplier})}addGrindPoints(e,t){const i=Math.floor(e*t);this.totalPoints+=i,this.comboTimer=this.maxComboTime}addManualPoints(e,t){const i=Math.floor(e*t);this.totalPoints+=i,this.comboTimer=this.maxComboTime}update(e){this.isActive&&(this.comboTimer-=e*1e3)}land(){if(!this.isActive)return 0;const e=this.getPotentialScore();return this.emit({type:"combo_landed",totalScore:e,multiplier:this.multiplier,tricks:[...this.currentTricks]}),this.reset(),e}bail(){this.isActive&&(this.emit({type:"combo_failed",totalScore:this.getPotentialScore(),tricks:[...this.currentTricks]}),this.reset())}reset(){this.currentTricks=[],this.multiplier=1,this.totalPoints=0,this.comboTimer=0,this.isActive=!1,this.trickCounts.clear()}getPotentialScore(){return Math.floor(this.totalPoints*this.multiplier)}getState(){return{tricks:[...this.currentTricks],multiplier:this.multiplier,totalPoints:this.totalPoints,isActive:this.isActive,timeRemaining:this.comboTimer}}hasActiveCombo(){return this.isActive}getMultiplier(){return this.multiplier}getLastTrick(){return this.currentTricks[this.currentTricks.length-1]||null}}const ls={flip:"#00FFFF",grab:"#FFD700",grind:"#FF8C00",manual:"#32CD32",special:"#FF00FF"},cs="tonyStonks_hasPlayed";class Ao{container;scoreElement;comboElement;comboTimerFill;trickPopup;specialMeter;specialFill;balanceMeter;balanceArrow;controlsHint;spinCounterElement;speedChartElement;speedBars=[];currentScore=0;displayedScore=0;specialAmount=0;lastMultiplier=1;controlsHidden=!1;constructor(e){this.container=e,this.createElements()}createElements(){const e=document.createElement("style");e.textContent=`
      .hud-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        font-family: 'Kanit', sans-serif;
        color: white;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      }
      
      .hud-score {
        position: absolute;
        top: 16px;
        right: 20px;
        font-size: 56px;
        text-align: right;
        background: rgba(0,0,0,0.55);
        border: 2px solid #00FF88;
        border-radius: 10px;
        padding: 8px 18px 6px;
        min-width: 220px;
      }
      
      .hud-score-label {
        font-size: 14px;
        color: #00FF88;
        letter-spacing: 3px;
        font-weight: 700;
      }

      .hud-score-value {
        color: #00FF88;
        font-weight: 900;
        letter-spacing: 1px;
        transition: transform 0.1s ease-out;
      }

      .hud-score-value.negative {
        color: #FF4444;
      }

      /* Speed stock chart */
      .hud-speed-chart {
        position: absolute;
        bottom: 60px;
        right: 20px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        pointer-events: none;
      }

      .hud-speed-label {
        font-size: 11px;
        color: #00FF88;
        letter-spacing: 2px;
        font-weight: 700;
        opacity: 0.9;
      }

      .hud-speed-bars {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 28px;
      }

      .hud-speed-bar {
        width: 6px;
        border-radius: 2px 2px 0 0;
        background: #00FF88;
        transition: height 0.15s ease-out, background 0.2s;
        min-height: 2px;
      }
      
      .hud-combo {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        opacity: 0;
        transition: opacity 0.2s;
        background: rgba(0,0,0,0.6);
        border: 2px solid rgba(255,215,0,0.4);
        border-radius: 12px;
        padding: 10px 22px 8px;
        backdrop-filter: blur(4px);
      }
      
      .hud-combo.active {
        opacity: 1;
      }
      
      .hud-combo-tricks {
        font-size: 22px;
        color: #FFD700;
      }
      
      .hud-combo-score {
        font-size: 42px;
        font-weight: 900;
        color: #ffffff;
        text-shadow: 0 0 16px rgba(255,255,255,0.5);
      }
      
      .hud-combo-multiplier {
        font-size: 32px;
        font-weight: 700;
        color: #00FF88;
        transition: transform 0.15s ease-out;
        text-shadow: 0 0 12px rgba(0,255,136,0.6);
      }
      
      .hud-combo-multiplier.pulse {
        animation: multiplierPulse 0.3s ease-out;
      }
      
      @keyframes multiplierPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.4); color: #FFFF00; }
        100% { transform: scale(1); }
      }
      
      .hud-combo-timer {
        width: 200px;
        height: 6px;
        background: rgba(0,0,0,0.5);
        border-radius: 3px;
        margin-top: 8px;
        overflow: hidden;
        opacity: 0;
        transition: opacity 0.2s;
      }
      
      .hud-combo.active .hud-combo-timer {
        opacity: 1;
      }
      
      .hud-combo-timer-fill {
        height: 100%;
        width: 100%;
        background: linear-gradient(90deg, #FF4444, #FFD700, #00FF88);
        border-radius: 3px;
        transition: width 0.05s linear;
        transform-origin: left;
      }
      
      .hud-combo-timer-fill.urgent {
        animation: timerUrgent 0.3s infinite;
      }
      
      @keyframes timerUrgent {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.5); background: #FF4444; }
      }
      
      .hud-trick-popup {
        position: absolute;
        bottom: 40%;
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
      }
      
      .hud-trick-popup.show {
        opacity: 1;
        animation: trickPop 0.5s ease-out;
      }
      
      @keyframes trickPop {
        0% { transform: translateX(-50%) scale(0.5); opacity: 0; }
        50% { transform: translateX(-50%) scale(1.2); }
        100% { transform: translateX(-50%) scale(1); opacity: 1; }
      }
      
      .hud-trick-name {
        font-size: 32px;
        color: #00FFFF;
      }
      
      .hud-trick-points {
        font-size: 24px;
        color: #00FF88;
      }
      
      .hud-special-meter {
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 150px;
        height: 20px;
        background: rgba(0,0,0,0.5);
        border: 2px solid #FFD700;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .hud-special-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #FFD700, #FF6B00);
        transition: width 0.3s;
      }
      
      .hud-special-meter.full {
        animation: specialGlow 0.6s infinite alternate ease-in-out;
        border-color: #FFFF00;
      }
      
      .hud-special-meter.full .hud-special-fill {
        animation: specialPulse 0.5s infinite alternate;
      }
      
      .hud-special-meter.full .hud-special-label {
        animation: specialLabelGlow 0.6s infinite alternate ease-in-out;
      }
      
      @keyframes specialPulse {
        from { filter: brightness(1); }
        to { filter: brightness(1.5); }
      }
      
      @keyframes specialGlow {
        from {
          box-shadow: 0 0 10px #FFD700, 0 0 20px rgba(255, 215, 0, 0.5), inset 0 0 10px rgba(255, 215, 0, 0.3);
        }
        to {
          box-shadow: 0 0 20px #FFFF00, 0 0 40px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 107, 0, 0.4), inset 0 0 15px rgba(255, 215, 0, 0.5);
        }
      }
      
      @keyframes specialLabelGlow {
        from {
          color: #FFD700;
          text-shadow: 0 0 5px #FFD700;
        }
        to {
          color: #FFFF00;
          text-shadow: 0 0 10px #FFFF00, 0 0 20px #FFD700;
        }
      }
      
      .hud-special-label {
        position: absolute;
        top: -18px;
        right: 0;
        font-size: 14px;
        color: #FFD700;
        letter-spacing: 2px;
      }
      
      .hud-balance-meter {
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translateX(-50%);
        width: 300px;
        height: 20px;
        background: rgba(0,0,0,0.7);
        border: 2px solid #FFD700;
        border-radius: 10px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      
      .hud-balance-meter.active {
        opacity: 1;
      }
      
      .hud-balance-label {
        position: absolute;
        top: -25px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 16px;
        color: #FFD700;
        letter-spacing: 2px;
      }
      
      .hud-balance-zones {
        position: absolute;
        width: 100%;
        height: 100%;
        display: flex;
        border-radius: 8px;
        overflow: hidden;
      }
      
      .hud-balance-danger {
        width: 15%;
        height: 100%;
        background: linear-gradient(90deg, #FF0000, #FF4444);
      }
      
      .hud-balance-safe {
        flex: 1;
        background: linear-gradient(90deg, #44FF44, #00FF88, #44FF44);
      }
      
      .hud-balance-arrow {
        position: absolute;
        top: -12px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 12px solid transparent;
        border-right: 12px solid transparent;
        border-top: 18px solid #FFFFFF;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        transition: left 0.05s;
      }
      
      .hud-spin-counter {
        position: absolute;
        top: 25%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 48px;
        font-weight: bold;
        color: #FFD700;
        text-shadow: 0 0 20px rgba(255,215,0,0.8), 3px 3px 6px rgba(0,0,0,0.9);
        opacity: 0;
        transition: opacity 0.15s ease-out;
        letter-spacing: 4px;
      }
      
      .hud-spin-counter.active {
        opacity: 1;
        animation: spinPulse 0.15s ease-out;
      }
      
      @keyframes spinPulse {
        0% { transform: translateX(-50%) scale(1.3); }
        100% { transform: translateX(-50%) scale(1); }
      }
      
      .hud-controls {
        position: absolute;
        bottom: 20px;
        left: 20px;
        font-size: 12px;
        font-family: 'Kanit', sans-serif;
        color: rgba(255,255,255,0.6);
        line-height: 1.6;
      }
      
      .hud-title {
        position: absolute;
        top: 20px;
        left: 20px;
        font-size: 24px;
        color: #00FF88;
      }
    `,document.head.appendChild(e);const t=document.createElement("div");t.className="hud-container";const i=document.createElement("div");i.className="hud-title",i.textContent="TONY STONKS",t.appendChild(i),this.scoreElement=document.createElement("div"),this.scoreElement.className="hud-score",this.scoreElement.innerHTML=`
      <div class="hud-score-label">📈 STONKS</div>
      <div class="hud-score-value">$0</div>
    `,t.appendChild(this.scoreElement),this.speedChartElement=document.createElement("div"),this.speedChartElement.className="hud-speed-chart";const s=document.createElement("div");s.className="hud-speed-bars";const n=12;for(let r=0;r<n;r++){const l=document.createElement("div");l.className="hud-speed-bar",l.style.height="2px",s.appendChild(l),this.speedBars.push(l)}const o=document.createElement("div");o.className="hud-speed-label",o.textContent="⚡ SPEED",this.speedChartElement.appendChild(o),this.speedChartElement.appendChild(s),t.appendChild(this.speedChartElement),this.comboElement=document.createElement("div"),this.comboElement.className="hud-combo",this.comboElement.innerHTML=`
      <div class="hud-combo-tricks"></div>
      <div class="hud-combo-score"></div>
      <div class="hud-combo-multiplier"></div>
      <div class="hud-combo-timer">
        <div class="hud-combo-timer-fill"></div>
      </div>
    `,this.comboTimerFill=this.comboElement.querySelector(".hud-combo-timer-fill"),t.appendChild(this.comboElement),this.trickPopup=document.createElement("div"),this.trickPopup.className="hud-trick-popup",this.trickPopup.innerHTML=`
      <div class="hud-trick-name"></div>
      <div class="hud-trick-points"></div>
    `,t.appendChild(this.trickPopup),this.specialMeter=document.createElement("div"),this.specialMeter.className="hud-special-meter",this.specialMeter.innerHTML=`
      <div class="hud-special-label">SPECIAL</div>
      <div class="hud-special-fill"></div>
    `,this.specialFill=this.specialMeter.querySelector(".hud-special-fill"),t.appendChild(this.specialMeter),this.balanceMeter=document.createElement("div"),this.balanceMeter.className="hud-balance-meter",this.balanceMeter.innerHTML=`
      <div class="hud-balance-label">⚖️ BALANCE</div>
      <div class="hud-balance-zones">
        <div class="hud-balance-danger"></div>
        <div class="hud-balance-safe"></div>
        <div class="hud-balance-danger"></div>
      </div>
      <div class="hud-balance-arrow"></div>
    `,this.balanceArrow=this.balanceMeter.querySelector(".hud-balance-arrow"),t.appendChild(this.balanceMeter),this.spinCounterElement=document.createElement("div"),this.spinCounterElement.className="hud-spin-counter",t.appendChild(this.spinCounterElement),this.controlsHint=document.createElement("div"),this.controlsHint.className="hud-controls",this.controlsHint.innerHTML=`
      W - Push forward<br>
      S - Brake<br>
      A/D - Turn<br>
      SPACE - Ollie<br>
      ↑ - Grind (near rail)<br>
      ← + WASD - Flip tricks<br>
      → + WASD - Grab tricks<br>
      Q/E - Spin (in air)<br>
      ESC - Pause
    `,localStorage.getItem(cs)==="true"&&(this.controlsHint.style.display="none",this.controlsHidden=!0),t.appendChild(this.controlsHint),this.container.appendChild(t)}setScore(e){this.currentScore=e}setSpeed(e){const i=this.speedBars.length,s=Math.min(1,e/20),n=28;this._speedHistory||(this._speedHistory=new Array(i).fill(0)),this._speedHistory.push(s),this._speedHistory.length>i&&this._speedHistory.shift();for(let o=0;o<i;o++){const a=this._speedHistory[o]??0,r=Math.max(2,Math.round(a*n)),l=this.speedBars[o];l.style.height=r+"px",a<.5?l.style.background="#00FF88":a<.8?l.style.background="#FFD700":l.style.background="#FF4444"}}_speedHistory;update(e){if(this.displayedScore<this.currentScore){const t=this.currentScore-this.displayedScore,i=Math.max(10,t*3),s=Math.max(1,Math.round(i*e)),n=this.displayedScore;this.displayedScore=Math.min(this.currentScore,this.displayedScore+s);const o=this.scoreElement.querySelector(".hud-score-value");if(o&&(o.textContent="$"+this.displayedScore.toLocaleString(),t>100&&this.displayedScore!==n)){const a=1+Math.min(.15,s/500);o.style.transform=`scale(${a})`,o.style.transition="transform 0.1s ease-out",setTimeout(()=>{o.style.transform="scale(1)"},50)}}}showTrick(e,t,i,s){const n=this.trickPopup.querySelector(".hud-trick-name"),o=this.trickPopup.querySelector(".hud-trick-points");n&&(n.textContent=e,n.style.color=s?ls[s]:"#00FFFF"),o&&(o.textContent=`+${t} × ${i}`),this.trickPopup.classList.remove("show"),this.trickPopup.offsetWidth,this.trickPopup.classList.add("show"),setTimeout(()=>{this.trickPopup.classList.remove("show")},1500)}updateComboTimer(e,t){const i=Math.max(0,Math.min(100,e/t*100));this.comboTimerFill.style.width=`${i}%`,i<30&&i>0?this.comboTimerFill.classList.add("urgent"):this.comboTimerFill.classList.remove("urgent")}updateCombo(e,t,i){const s=this.comboElement.querySelector(".hud-combo-tricks"),n=this.comboElement.querySelector(".hud-combo-score"),o=this.comboElement.querySelector(".hud-combo-multiplier");if(e.length>0){this.comboElement.classList.add("active");const a=e.slice(-5);s&&(s.innerHTML=a.map(r=>`<span style="color:${ls[r.trick.type]||"#00FFFF"}">${r.trick.displayName}</span>`).join(' <span style="color:#888">+</span> ')),n&&(n.textContent=(t*i).toLocaleString()),o&&(o.textContent=`× ${i}`,i>this.lastMultiplier&&(o.classList.remove("pulse"),o.offsetWidth,o.classList.add("pulse"))),this.lastMultiplier=i}else this.comboElement.classList.remove("active"),this.lastMultiplier=1}onComboEvent(e){switch(e.type){case"trick_added":e.trick&&e.points!==void 0&&e.multiplier!==void 0&&this.showTrick(e.trick.displayName,e.points,e.multiplier,e.trick.type);break;case"combo_landed":e.totalScore!==void 0&&(this.currentScore+=e.totalScore,this.scoreElement.style.color="#00FF88",setTimeout(()=>{this.scoreElement.style.color=""},300)),this.comboElement.classList.remove("active");break;case"combo_failed":this.comboElement.style.color="#FF4444",setTimeout(()=>{this.comboElement.style.color="",this.comboElement.classList.remove("active")},500);break}}setSpecial(e){this.specialAmount=Math.min(1,Math.max(0,e)),this.specialFill.style.width=`${this.specialAmount*100}%`,this.specialAmount>=1?this.specialMeter.classList.add("full"):this.specialMeter.classList.remove("full")}setBalanceVisible(e){e?this.balanceMeter.classList.add("active"):this.balanceMeter.classList.remove("active")}setBalance(e){const t=Math.min(100,Math.max(0,e*100));this.balanceArrow.style.left=`${t}%`}reset(){this.currentScore=0,this.displayedScore=0,this.specialAmount=0,this._speedHistory=new Array(this.speedBars.length).fill(0),this.speedBars.forEach(t=>{t.style.height="2px",t.style.background="#00FF88"});const e=this.scoreElement.querySelector(".hud-score-value");e&&(e.textContent="$0"),this.specialFill.style.width="0%",this.specialMeter.classList.remove("full"),this.comboElement.classList.remove("active"),this.comboTimerFill.style.width="100%",this.comboTimerFill.classList.remove("urgent"),this.trickPopup.classList.remove("show"),this.balanceMeter.classList.remove("active"),this.spinCounterElement.classList.remove("active"),this.spinCounterElement.textContent=""}setSpinCounter(e){if(e>=180){const i=`${Math.floor(e/180)*180}°`;this.spinCounterElement.textContent!==i&&(this.spinCounterElement.textContent=i,this.spinCounterElement.classList.remove("active"),this.spinCounterElement.offsetWidth,this.spinCounterElement.classList.add("active"))}else this.spinCounterElement.classList.remove("active")}hideControlsHint(){if(!this.controlsHidden){this.controlsHint.style.transition="opacity 0.5s ease-out",this.controlsHint.style.opacity="0",setTimeout(()=>{this.controlsHint.style.display="none"},500);try{localStorage.setItem(cs,"true")}catch{}this.controlsHidden=!0}}}/*!
fflate - fast JavaScript compression/decompression
<https://101arrowz.github.io/fflate>
Licensed under MIT. https://github.com/101arrowz/fflate/blob/master/LICENSE
version 0.6.9
*/var ds=function(p){return URL.createObjectURL(new Blob([p],{type:"text/javascript"}))};try{URL.revokeObjectURL(ds(""))}catch{ds=function(e){return"data:application/javascript;charset=UTF-8,"+encodeURI(e)}}var xe=Uint8Array,We=Uint16Array,Gi=Uint32Array,Ys=new xe([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),Ks=new xe([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),Lo=new xe([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),Ws=function(p,e){for(var t=new We(31),i=0;i<31;++i)t[i]=e+=1<<p[i-1];for(var s=new Gi(t[30]),i=1;i<30;++i)for(var n=t[i];n<t[i+1];++n)s[n]=n-t[i]<<5|i;return[t,s]},Zs=Ws(Ys,2),Qs=Zs[0],Po=Zs[1];Qs[28]=258,Po[258]=28;var Ro=Ws(Ks,0),_o=Ro[0],Bi=new We(32768);for(var $=0;$<32768;++$){var Ue=($&43690)>>>1|($&21845)<<1;Ue=(Ue&52428)>>>2|(Ue&13107)<<2,Ue=(Ue&61680)>>>4|(Ue&3855)<<4,Bi[$]=((Ue&65280)>>>8|(Ue&255)<<8)>>>1}var jt=function(p,e,t){for(var i=p.length,s=0,n=new We(e);s<i;++s)++n[p[s]-1];var o=new We(e);for(s=0;s<e;++s)o[s]=o[s-1]+n[s-1]<<1;var a;if(t){a=new We(1<<e);var r=15-e;for(s=0;s<i;++s)if(p[s])for(var l=s<<4|p[s],d=e-p[s],c=o[p[s]-1]++<<d,h=c|(1<<d)-1;c<=h;++c)a[Bi[c]>>>r]=l}else for(a=new We(i),s=0;s<i;++s)p[s]&&(a[s]=Bi[o[p[s]-1]++]>>>15-p[s]);return a},Vt=new xe(288);for(var $=0;$<144;++$)Vt[$]=8;for(var $=144;$<256;++$)Vt[$]=9;for(var $=256;$<280;++$)Vt[$]=7;for(var $=280;$<288;++$)Vt[$]=8;var Js=new xe(32);for(var $=0;$<32;++$)Js[$]=5;var Io=jt(Vt,9,1),Oo=jt(Js,5,1),gi=function(p){for(var e=p[0],t=1;t<p.length;++t)p[t]>e&&(e=p[t]);return e},ke=function(p,e,t){var i=e/8|0;return(p[i]|p[i+1]<<8)>>(e&7)&t},yi=function(p,e){var t=e/8|0;return(p[t]|p[t+1]<<8|p[t+2]<<16)>>(e&7)},Fo=function(p){return(p/8|0)+(p&7&&1)},Do=function(p,e,t){(t==null||t>p.length)&&(t=p.length);var i=new(p instanceof We?We:p instanceof Gi?Gi:xe)(t-e);return i.set(p.subarray(e,t)),i},Go=function(p,e,t){var i=p.length;if(!i||t&&!t.l&&i<5)return e||new xe(0);var s=!e||t,n=!t||t.i;t||(t={}),e||(e=new xe(i*3));var o=function(Qe){var Be=e.length;if(Qe>Be){var Se=new xe(Math.max(Be*2,Qe));Se.set(e),e=Se}},a=t.f||0,r=t.p||0,l=t.b||0,d=t.l,c=t.d,h=t.m,u=t.n,y=i*8;do{if(!d){t.f=a=ke(p,r,1);var b=ke(p,r+1,3);if(r+=3,b)if(b==1)d=Io,c=Oo,h=9,u=5;else if(b==2){var S=ke(p,r,31)+257,C=ke(p,r+10,15)+4,P=S+ke(p,r+5,31)+1;r+=14;for(var L=new xe(P),M=new xe(19),_=0;_<C;++_)M[Lo[_]]=ke(p,r+_*3,7);r+=C*3;for(var U=gi(M),q=(1<<U)-1,oe=jt(M,U,1),_=0;_<P;){var W=oe[ke(p,r,q)];r+=W&15;var w=W>>>4;if(w<16)L[_++]=w;else{var ce=0,te=0;for(w==16?(te=3+ke(p,r,3),r+=2,ce=L[_-1]):w==17?(te=3+ke(p,r,7),r+=3):w==18&&(te=11+ke(p,r,127),r+=7);te--;)L[_++]=ce}}var K=L.subarray(0,S),Z=L.subarray(S);h=gi(K),u=gi(Z),d=jt(K,h,1),c=jt(Z,u,1)}else throw"invalid block type";else{var w=Fo(r)+4,x=p[w-4]|p[w-3]<<8,v=w+x;if(v>i){if(n)throw"unexpected EOF";break}s&&o(l+x),e.set(p.subarray(w,v),l),t.b=l+=x,t.p=r=v*8;continue}if(r>y){if(n)throw"unexpected EOF";break}}s&&o(l+131072);for(var ie=(1<<h)-1,ge=(1<<u)-1,z=r;;z=r){var ce=d[yi(p,r)&ie],Q=ce>>>4;if(r+=ce&15,r>y){if(n)throw"unexpected EOF";break}if(!ce)throw"invalid length/literal";if(Q<256)e[l++]=Q;else if(Q==256){z=r,d=null;break}else{var ye=Q-254;if(Q>264){var _=Q-257,ae=Ys[_];ye=ke(p,r,(1<<ae)-1)+Qs[_],r+=ae}var fe=c[yi(p,r)&ge],ve=fe>>>4;if(!fe)throw"invalid distance";r+=fe&15;var Z=_o[ve];if(ve>3){var ae=Ks[ve];Z+=yi(p,r)&(1<<ae)-1,r+=ae}if(r>y){if(n)throw"unexpected EOF";break}s&&o(l+131072);for(var Ge=l+ye;l<Ge;l+=4)e[l]=e[l-Z],e[l+1]=e[l+1-Z],e[l+2]=e[l+2-Z],e[l+3]=e[l+3-Z];l=Ge}}t.l=d,t.p=z,t.b=l,d&&(a=1,t.m=h,t.d=c,t.n=u)}while(!a);return l==e.length?e:Do(e,0,l)},Bo=new xe(0),No=function(p){if((p[0]&15)!=8||p[0]>>>4>7||(p[0]<<8|p[1])%31)throw"invalid zlib data";if(p[1]&32)throw"invalid zlib data: preset dictionaries not supported"};function jo(p,e){return Go((No(p),p.subarray(2,-4)),e)}var zo=typeof TextDecoder<"u"&&new TextDecoder,Ho=0;try{zo.decode(Bo,{stream:!0}),Ho=1}catch{}function en(p,e,t){const i=t.length-p-1;if(e>=t[i])return i-1;if(e<=t[p])return p;let s=p,n=i,o=Math.floor((s+n)/2);for(;e<t[o]||e>=t[o+1];)e<t[o]?n=o:s=o,o=Math.floor((s+n)/2);return o}function Uo(p,e,t,i){const s=[],n=[],o=[];s[0]=1;for(let a=1;a<=t;++a){n[a]=e-i[p+1-a],o[a]=i[p+a]-e;let r=0;for(let l=0;l<a;++l){const d=o[l+1],c=n[a-l],h=s[l]/(d+c);s[l]=r+d*h,r=c*h}s[a]=r}return s}function qo(p,e,t,i){const s=en(p,i,e),n=Uo(s,i,p,e),o=new ri(0,0,0,0);for(let a=0;a<=p;++a){const r=t[s-p+a],l=n[a],d=r.w*l;o.x+=r.x*d,o.y+=r.y*d,o.z+=r.z*d,o.w+=r.w*l}return o}function Vo(p,e,t,i,s){const n=[];for(let c=0;c<=t;++c)n[c]=0;const o=[];for(let c=0;c<=i;++c)o[c]=n.slice(0);const a=[];for(let c=0;c<=t;++c)a[c]=n.slice(0);a[0][0]=1;const r=n.slice(0),l=n.slice(0);for(let c=1;c<=t;++c){r[c]=e-s[p+1-c],l[c]=s[p+c]-e;let h=0;for(let u=0;u<c;++u){const y=l[u+1],b=r[c-u];a[c][u]=y+b;const w=a[u][c-1]/a[c][u];a[u][c]=h+y*w,h=b*w}a[c][c]=h}for(let c=0;c<=t;++c)o[0][c]=a[c][t];for(let c=0;c<=t;++c){let h=0,u=1;const y=[];for(let b=0;b<=t;++b)y[b]=n.slice(0);y[0][0]=1;for(let b=1;b<=i;++b){let w=0;const x=c-b,v=t-b;c>=b&&(y[u][0]=y[h][0]/a[v+1][x],w=y[u][0]*a[x][v]);const S=x>=-1?1:-x,C=c-1<=v?b-1:t-c;for(let L=S;L<=C;++L)y[u][L]=(y[h][L]-y[h][L-1])/a[v+1][x+L],w+=y[u][L]*a[x+L][v];c<=v&&(y[u][b]=-y[h][b-1]/a[v+1][c],w+=y[u][b]*a[c][v]),o[b][c]=w;const P=h;h=u,u=P}}let d=t;for(let c=1;c<=i;++c){for(let h=0;h<=t;++h)o[c][h]*=d;d*=t-c}return o}function $o(p,e,t,i,s){const n=s<p?s:p,o=[],a=en(p,i,e),r=Vo(a,i,p,n,e),l=[];for(let d=0;d<t.length;++d){const c=t[d].clone(),h=c.w;c.x*=h,c.y*=h,c.z*=h,l[d]=c}for(let d=0;d<=n;++d){const c=l[a-p].clone().multiplyScalar(r[d][0]);for(let h=1;h<=p;++h)c.add(l[a-p+h].clone().multiplyScalar(r[d][h]));o[d]=c}for(let d=n+1;d<=s+1;++d)o[d]=new ri(0,0,0);return o}function Xo(p,e){let t=1;for(let s=2;s<=p;++s)t*=s;let i=1;for(let s=2;s<=e;++s)i*=s;for(let s=2;s<=p-e;++s)i*=s;return t/i}function Yo(p){const e=p.length,t=[],i=[];for(let n=0;n<e;++n){const o=p[n];t[n]=new m(o.x,o.y,o.z),i[n]=o.w}const s=[];for(let n=0;n<e;++n){const o=t[n].clone();for(let a=1;a<=n;++a)o.sub(s[n-a].clone().multiplyScalar(Xo(n,a)*i[a]));s[n]=o.divideScalar(i[0])}return s}function Ko(p,e,t,i,s){const n=$o(p,e,t,i,s);return Yo(n)}class Wo extends Mn{constructor(e,t,i,s,n){super(),this.degree=e,this.knots=t,this.controlPoints=[],this.startKnot=s||0,this.endKnot=n||this.knots.length-1;for(let o=0;o<i.length;++o){const a=i[o];this.controlPoints[o]=new ri(a.x,a.y,a.z,a.w)}}getPoint(e,t=new m){const i=t,s=this.knots[this.startKnot]+e*(this.knots[this.endKnot]-this.knots[this.startKnot]),n=qo(this.degree,this.knots,this.controlPoints,s);return n.w!==1&&n.divideScalar(n.w),i.set(n.x,n.y,n.z)}getTangent(e,t=new m){const i=t,s=this.knots[0]+e*(this.knots[this.knots.length-1]-this.knots[0]),n=Ko(this.degree,this.knots,this.controlPoints,s,1);return i.copy(n[1]).normalize(),i}}let I,ee,he;class tn extends si{constructor(e){super(e)}load(e,t,i,s){const n=this,o=n.path===""?bt.extractUrlBase(e):n.path,a=new Ni(this.manager);a.setPath(n.path),a.setResponseType("arraybuffer"),a.setRequestHeader(n.requestHeader),a.setWithCredentials(n.withCredentials),a.load(e,function(r){try{t(n.parse(r,o))}catch(l){s?s(l):console.error(l),n.manager.itemError(e)}},i,s)}parse(e,t){if(ia(e))I=new ta().parse(e);else{const s=an(e);if(!sa(s))throw new Error("THREE.FBXLoader: Unknown format.");if(ps(s)<7e3)throw new Error("THREE.FBXLoader: FBX version not supported, FileVersion: "+ps(s));I=new ea().parse(s)}const i=new vt(this.manager).setPath(this.resourcePath||t).setCrossOrigin(this.crossOrigin);return new Zo(i,this.manager).parse(I)}}class Zo{constructor(e,t){this.textureLoader=e,this.manager=t}parse(){ee=this.parseConnections();const e=this.parseImages(),t=this.parseTextures(e),i=this.parseMaterials(t),s=this.parseDeformers(),n=new Qo().parse(s);return this.parseScene(s,n,i),he}parseConnections(){const e=new Map;return"Connections"in I&&I.Connections.connections.forEach(function(i){const s=i[0],n=i[1],o=i[2];e.has(s)||e.set(s,{parents:[],children:[]});const a={ID:n,relationship:o};e.get(s).parents.push(a),e.has(n)||e.set(n,{parents:[],children:[]});const r={ID:s,relationship:o};e.get(n).children.push(r)}),e}parseImages(){const e={},t={};if("Video"in I.Objects){const i=I.Objects.Video;for(const s in i){const n=i[s],o=parseInt(s);if(e[o]=n.RelativeFilename||n.Filename,"Content"in n){const a=n.Content instanceof ArrayBuffer&&n.Content.byteLength>0,r=typeof n.Content=="string"&&n.Content!=="";if(a||r){const l=this.parseImage(i[s]);t[n.RelativeFilename||n.Filename]=l}}}}for(const i in e){const s=e[i];t[s]!==void 0?e[i]=t[s]:e[i]=e[i].split("\\").pop()}return e}parseImage(e){const t=e.Content,i=e.RelativeFilename||e.Filename,s=i.slice(i.lastIndexOf(".")+1).toLowerCase();let n;switch(s){case"bmp":n="image/bmp";break;case"jpg":case"jpeg":n="image/jpeg";break;case"png":n="image/png";break;case"tif":n="image/tiff";break;case"tga":this.manager.getHandler(".tga")===null&&console.warn("FBXLoader: TGA loader not found, skipping ",i),n="image/tga";break;default:console.warn('FBXLoader: Image type "'+s+'" is not supported.');return}if(typeof t=="string")return"data:"+n+";base64,"+t;{const o=new Uint8Array(t);return window.URL.createObjectURL(new Blob([o],{type:n}))}}parseTextures(e){const t=new Map;if("Texture"in I.Objects){const i=I.Objects.Texture;for(const s in i){const n=this.parseTexture(i[s],e);t.set(parseInt(s),n)}}return t}parseTexture(e,t){const i=this.loadTexture(e,t);i.ID=e.id,i.name=e.attrName;const s=e.WrapModeU,n=e.WrapModeV,o=s!==void 0?s.value:0,a=n!==void 0?n.value:0;if(i.wrapS=o===0?me:Pi,i.wrapT=a===0?me:Pi,"Scaling"in e){const r=e.Scaling.value;i.repeat.x=r[0],i.repeat.y=r[1]}if("Translation"in e){const r=e.Translation.value;i.offset.x=r[0],i.offset.y=r[1]}return i}loadTexture(e,t){let i;const s=this.textureLoader.path,n=ee.get(e.id).children;n!==void 0&&n.length>0&&t[n[0].ID]!==void 0&&(i=t[n[0].ID],(i.indexOf("blob:")===0||i.indexOf("data:")===0)&&this.textureLoader.setPath(void 0));let o;const a=e.FileName.slice(-3).toLowerCase();if(a==="tga"){const r=this.manager.getHandler(".tga");r===null?(console.warn("FBXLoader: TGA loader not found, creating placeholder texture for",e.RelativeFilename),o=new Gt):(r.setPath(this.textureLoader.path),o=r.load(i))}else if(a==="dds"){const r=this.manager.getHandler(".dds");r===null?(console.warn("FBXLoader: DDS loader not found, creating placeholder texture for",e.RelativeFilename),o=new Gt):(r.setPath(this.textureLoader.path),o=r.load(i))}else a==="psd"?(console.warn("FBXLoader: PSD textures are not supported, creating placeholder texture for",e.RelativeFilename),o=new Gt):o=this.textureLoader.load(i);return this.textureLoader.setPath(s),o}parseMaterials(e){const t=new Map;if("Material"in I.Objects){const i=I.Objects.Material;for(const s in i){const n=this.parseMaterial(i[s],e);n!==null&&t.set(parseInt(s),n)}}return t}parseMaterial(e,t){const i=e.id,s=e.attrName;let n=e.ShadingModel;if(typeof n=="object"&&(n=n.value),!ee.has(i))return null;const o=this.parseParameters(e,t,i);let a;switch(n.toLowerCase()){case"phong":a=new pi;break;case"lambert":a=new An;break;default:console.warn('THREE.FBXLoader: unknown material type "%s". Defaulting to MeshPhongMaterial.',n),a=new pi;break}return a.setValues(o),a.name=s,a}parseParameters(e,t,i){const s={};e.BumpFactor&&(s.bumpScale=e.BumpFactor.value),e.Diffuse?s.color=new B().fromArray(e.Diffuse.value).convertSRGBToLinear():e.DiffuseColor&&(e.DiffuseColor.type==="Color"||e.DiffuseColor.type==="ColorRGB")&&(s.color=new B().fromArray(e.DiffuseColor.value).convertSRGBToLinear()),e.DisplacementFactor&&(s.displacementScale=e.DisplacementFactor.value),e.Emissive?s.emissive=new B().fromArray(e.Emissive.value).convertSRGBToLinear():e.EmissiveColor&&(e.EmissiveColor.type==="Color"||e.EmissiveColor.type==="ColorRGB")&&(s.emissive=new B().fromArray(e.EmissiveColor.value).convertSRGBToLinear()),e.EmissiveFactor&&(s.emissiveIntensity=parseFloat(e.EmissiveFactor.value)),e.Opacity&&(s.opacity=parseFloat(e.Opacity.value)),s.opacity<1&&(s.transparent=!0),e.ReflectionFactor&&(s.reflectivity=e.ReflectionFactor.value),e.Shininess&&(s.shininess=e.Shininess.value),e.Specular?s.specular=new B().fromArray(e.Specular.value).convertSRGBToLinear():e.SpecularColor&&e.SpecularColor.type==="Color"&&(s.specular=new B().fromArray(e.SpecularColor.value).convertSRGBToLinear());const n=this;return ee.get(i).children.forEach(function(o){const a=o.relationship;switch(a){case"Bump":s.bumpMap=n.getTexture(t,o.ID);break;case"Maya|TEX_ao_map":s.aoMap=n.getTexture(t,o.ID);break;case"DiffuseColor":case"Maya|TEX_color_map":s.map=n.getTexture(t,o.ID),s.map!==void 0&&(s.map.colorSpace=ue);break;case"DisplacementColor":s.displacementMap=n.getTexture(t,o.ID);break;case"EmissiveColor":s.emissiveMap=n.getTexture(t,o.ID),s.emissiveMap!==void 0&&(s.emissiveMap.colorSpace=ue);break;case"NormalMap":case"Maya|TEX_normal_map":s.normalMap=n.getTexture(t,o.ID);break;case"ReflectionColor":s.envMap=n.getTexture(t,o.ID),s.envMap!==void 0&&(s.envMap.mapping=Bs,s.envMap.colorSpace=ue);break;case"SpecularColor":s.specularMap=n.getTexture(t,o.ID),s.specularMap!==void 0&&(s.specularMap.colorSpace=ue);break;case"TransparentColor":case"TransparencyFactor":s.alphaMap=n.getTexture(t,o.ID),s.transparent=!0;break;case"AmbientColor":case"ShininessExponent":case"SpecularFactor":case"VectorDisplacementColor":default:console.warn("THREE.FBXLoader: %s map is not supported in three.js, skipping texture.",a);break}}),s}getTexture(e,t){return"LayeredTexture"in I.Objects&&t in I.Objects.LayeredTexture&&(console.warn("THREE.FBXLoader: layered textures are not supported in three.js. Discarding all but first layer."),t=ee.get(t).children[0].ID),e.get(t)}parseDeformers(){const e={},t={};if("Deformer"in I.Objects){const i=I.Objects.Deformer;for(const s in i){const n=i[s],o=ee.get(parseInt(s));if(n.attrType==="Skin"){const a=this.parseSkeleton(o,i);a.ID=s,o.parents.length>1&&console.warn("THREE.FBXLoader: skeleton attached to more than one geometry is not supported."),a.geometryID=o.parents[0].ID,e[s]=a}else if(n.attrType==="BlendShape"){const a={id:s};a.rawTargets=this.parseMorphTargets(o,i),a.id=s,o.parents.length>1&&console.warn("THREE.FBXLoader: morph target attached to more than one geometry is not supported."),t[s]=a}}}return{skeletons:e,morphTargets:t}}parseSkeleton(e,t){const i=[];return e.children.forEach(function(s){const n=t[s.ID];if(n.attrType!=="Cluster")return;const o={ID:s.ID,indices:[],weights:[],transformLink:new N().fromArray(n.TransformLink.a)};"Indexes"in n&&(o.indices=n.Indexes.a,o.weights=n.Weights.a),i.push(o)}),{rawBones:i,bones:[]}}parseMorphTargets(e,t){const i=[];for(let s=0;s<e.children.length;s++){const n=e.children[s],o=t[n.ID],a={name:o.attrName,initialWeight:o.DeformPercent,id:o.id,fullWeights:o.FullWeights.a};if(o.attrType!=="BlendShapeChannel")return;a.geoID=ee.get(parseInt(n.ID)).children.filter(function(r){return r.relationship===void 0})[0].ID,i.push(a)}return i}parseScene(e,t,i){he=new A;const s=this.parseModels(e.skeletons,t,i),n=I.Objects.Model,o=this;s.forEach(function(r){const l=n[r.ID];o.setLookAtProperties(r,l),ee.get(r.ID).parents.forEach(function(c){const h=s.get(c.ID);h!==void 0&&h.add(r)}),r.parent===null&&he.add(r)}),this.bindSkeleton(e.skeletons,t,s),this.addGlobalSceneSettings(),he.traverse(function(r){if(r.userData.transformData){r.parent&&(r.userData.transformData.parentMatrix=r.parent.matrix,r.userData.transformData.parentMatrixWorld=r.parent.matrixWorld);const l=nn(r.userData.transformData);r.applyMatrix4(l),r.updateWorldMatrix()}});const a=new Jo().parse();he.children.length===1&&he.children[0].isGroup&&(he.children[0].animations=a,he=he.children[0]),he.animations=a}parseModels(e,t,i){const s=new Map,n=I.Objects.Model;for(const o in n){const a=parseInt(o),r=n[o],l=ee.get(a);let d=this.buildSkeleton(l,e,a,r.attrName);if(!d){switch(r.attrType){case"Camera":d=this.createCamera(l);break;case"Light":d=this.createLight(l);break;case"Mesh":d=this.createMesh(l,t,i);break;case"NurbsCurve":d=this.createCurve(l,t);break;case"LimbNode":case"Root":d=new Ri;break;case"Null":default:d=new A;break}d.name=r.attrName?Ht.sanitizeNodeName(r.attrName):"",d.userData.originalName=r.attrName,d.ID=a}this.getTransformData(d,r),s.set(a,d)}return s}buildSkeleton(e,t,i,s){let n=null;return e.parents.forEach(function(o){for(const a in t){const r=t[a];r.rawBones.forEach(function(l,d){if(l.ID===o.ID){const c=n;n=new Ri,n.matrixWorld.copy(l.transformLink),n.name=s?Ht.sanitizeNodeName(s):"",n.userData.originalName=s,n.ID=i,r.bones[d]=n,c!==null&&n.add(c)}})}}),n}createCamera(e){let t,i;if(e.children.forEach(function(s){const n=I.Objects.NodeAttribute[s.ID];n!==void 0&&(i=n)}),i===void 0)t=new Ze;else{let s=0;i.CameraProjectionType!==void 0&&i.CameraProjectionType.value===1&&(s=1);let n=1;i.NearPlane!==void 0&&(n=i.NearPlane.value/1e3);let o=1e3;i.FarPlane!==void 0&&(o=i.FarPlane.value/1e3);let a=window.innerWidth,r=window.innerHeight;i.AspectWidth!==void 0&&i.AspectHeight!==void 0&&(a=i.AspectWidth.value,r=i.AspectHeight.value);const l=a/r;let d=45;i.FieldOfView!==void 0&&(d=i.FieldOfView.value);const c=i.FocalLength?i.FocalLength.value:null;switch(s){case 0:t=new qt(d,l,n,o),c!==null&&t.setFocalLength(c);break;case 1:t=new qi(-a/2,a/2,r/2,-r/2,n,o);break;default:console.warn("THREE.FBXLoader: Unknown camera type "+s+"."),t=new Ze;break}}return t}createLight(e){let t,i;if(e.children.forEach(function(s){const n=I.Objects.NodeAttribute[s.ID];n!==void 0&&(i=n)}),i===void 0)t=new Ze;else{let s;i.LightType===void 0?s=0:s=i.LightType.value;let n=16777215;i.Color!==void 0&&(n=new B().fromArray(i.Color.value).convertSRGBToLinear());let o=i.Intensity===void 0?1:i.Intensity.value/100;i.CastLightOnObject!==void 0&&i.CastLightOnObject.value===0&&(o=0);let a=0;i.FarAttenuationEnd!==void 0&&(i.EnableFarAttenuation!==void 0&&i.EnableFarAttenuation.value===0?a=0:a=i.FarAttenuationEnd.value);const r=1;switch(s){case 0:t=new zt(n,o,a,r);break;case 1:t=new xt(n,o);break;case 2:let l=Math.PI/3;i.InnerAngle!==void 0&&(l=R.degToRad(i.InnerAngle.value));let d=0;i.OuterAngle!==void 0&&(d=R.degToRad(i.OuterAngle.value),d=Math.max(d,1)),t=new ji(n,o,a,l,d,r);break;default:console.warn("THREE.FBXLoader: Unknown light type "+i.LightType.value+", defaulting to a PointLight."),t=new zt(n,o);break}i.CastShadows!==void 0&&i.CastShadows.value===1&&(t.castShadow=!0)}return t}createMesh(e,t,i){let s,n=null,o=null;const a=[];return e.children.forEach(function(r){t.has(r.ID)&&(n=t.get(r.ID)),i.has(r.ID)&&a.push(i.get(r.ID))}),a.length>1?o=a:a.length>0?o=a[0]:(o=new pi({name:si.DEFAULT_MATERIAL_NAME,color:13421772}),a.push(o)),"color"in n.attributes&&a.forEach(function(r){r.vertexColors=!0}),n.FBX_Deformer?(s=new Is(n,o),s.normalizeSkinWeights()):s=new f(n,o),s}createCurve(e,t){const i=e.children.reduce(function(n,o){return t.has(o.ID)&&(n=t.get(o.ID)),n},null),s=new ai({name:si.DEFAULT_MATERIAL_NAME,color:3342591,linewidth:1});return new Me(i,s)}getTransformData(e,t){const i={};"InheritType"in t&&(i.inheritType=parseInt(t.InheritType.value)),"RotationOrder"in t?i.eulerOrder=on(t.RotationOrder.value):i.eulerOrder="ZYX","Lcl_Translation"in t&&(i.translation=t.Lcl_Translation.value),"PreRotation"in t&&(i.preRotation=t.PreRotation.value),"Lcl_Rotation"in t&&(i.rotation=t.Lcl_Rotation.value),"PostRotation"in t&&(i.postRotation=t.PostRotation.value),"Lcl_Scaling"in t&&(i.scale=t.Lcl_Scaling.value),"ScalingOffset"in t&&(i.scalingOffset=t.ScalingOffset.value),"ScalingPivot"in t&&(i.scalingPivot=t.ScalingPivot.value),"RotationOffset"in t&&(i.rotationOffset=t.RotationOffset.value),"RotationPivot"in t&&(i.rotationPivot=t.RotationPivot.value),e.userData.transformData=i}setLookAtProperties(e,t){"LookAtProperty"in t&&ee.get(e.ID).children.forEach(function(s){if(s.relationship==="LookAtProperty"){const n=I.Objects.Model[s.ID];if("Lcl_Translation"in n){const o=n.Lcl_Translation.value;e.target!==void 0?(e.target.position.fromArray(o),he.add(e.target)):e.lookAt(new m().fromArray(o))}}})}bindSkeleton(e,t,i){const s=this.parsePoseNodes();for(const n in e){const o=e[n];ee.get(parseInt(o.ID)).parents.forEach(function(r){if(t.has(r.ID)){const l=r.ID;ee.get(l).parents.forEach(function(c){i.has(c.ID)&&i.get(c.ID).bind(new Fs(o.bones),s[c.ID])})}})}}parsePoseNodes(){const e={};if("Pose"in I.Objects){const t=I.Objects.Pose;for(const i in t)if(t[i].attrType==="BindPose"&&t[i].NbPoseNodes>0){const s=t[i].PoseNode;Array.isArray(s)?s.forEach(function(n){e[n.Node]=new N().fromArray(n.Matrix.a)}):e[s.Node]=new N().fromArray(s.Matrix.a)}}return e}addGlobalSceneSettings(){if("GlobalSettings"in I){if("AmbientColor"in I.GlobalSettings){const e=I.GlobalSettings.AmbientColor.value,t=e[0],i=e[1],s=e[2];if(t!==0||i!==0||s!==0){const n=new B(t,i,s).convertSRGBToLinear();he.add(new li(n,1))}}"UnitScaleFactor"in I.GlobalSettings&&(he.userData.unitScaleFactor=I.GlobalSettings.UnitScaleFactor.value)}}}class Qo{constructor(){this.negativeMaterialIndices=!1}parse(e){const t=new Map;if("Geometry"in I.Objects){const i=I.Objects.Geometry;for(const s in i){const n=ee.get(parseInt(s)),o=this.parseGeometry(n,i[s],e);t.set(parseInt(s),o)}}return this.negativeMaterialIndices===!0&&console.warn("THREE.FBXLoader: The FBX file contains invalid (negative) material indices. The asset might not render as expected."),t}parseGeometry(e,t,i){switch(t.attrType){case"Mesh":return this.parseMeshGeometry(e,t,i);case"NurbsCurve":return this.parseNurbsGeometry(t)}}parseMeshGeometry(e,t,i){const s=i.skeletons,n=[],o=e.parents.map(function(c){return I.Objects.Model[c.ID]});if(o.length===0)return;const a=e.children.reduce(function(c,h){return s[h.ID]!==void 0&&(c=s[h.ID]),c},null);e.children.forEach(function(c){i.morphTargets[c.ID]!==void 0&&n.push(i.morphTargets[c.ID])});const r=o[0],l={};"RotationOrder"in r&&(l.eulerOrder=on(r.RotationOrder.value)),"InheritType"in r&&(l.inheritType=parseInt(r.InheritType.value)),"GeometricTranslation"in r&&(l.translation=r.GeometricTranslation.value),"GeometricRotation"in r&&(l.rotation=r.GeometricRotation.value),"GeometricScaling"in r&&(l.scale=r.GeometricScaling.value);const d=nn(l);return this.genGeometry(t,a,n,d)}genGeometry(e,t,i,s){const n=new Oe;e.attrName&&(n.name=e.attrName);const o=this.parseGeoNode(e,t),a=this.genBuffers(o),r=new $e(a.vertex,3);if(r.applyMatrix4(s),n.setAttribute("position",r),a.colors.length>0&&n.setAttribute("color",new $e(a.colors,3)),t&&(n.setAttribute("skinIndex",new Ln(a.weightsIndices,4)),n.setAttribute("skinWeight",new $e(a.vertexWeights,4)),n.FBX_Deformer=t),a.normal.length>0){const l=new Pn().getNormalMatrix(s),d=new $e(a.normal,3);d.applyNormalMatrix(l),n.setAttribute("normal",d)}if(a.uvs.forEach(function(l,d){const c=d===0?"uv":`uv${d}`;n.setAttribute(c,new $e(a.uvs[d],2))}),o.material&&o.material.mappingType!=="AllSame"){let l=a.materialIndex[0],d=0;if(a.materialIndex.forEach(function(c,h){c!==l&&(n.addGroup(d,h-d,l),l=c,d=h)}),n.groups.length>0){const c=n.groups[n.groups.length-1],h=c.start+c.count;h!==a.materialIndex.length&&n.addGroup(h,a.materialIndex.length-h,l)}n.groups.length===0&&n.addGroup(0,a.materialIndex.length,a.materialIndex[0])}return this.addMorphTargets(n,e,i,s),n}parseGeoNode(e,t){const i={};if(i.vertexPositions=e.Vertices!==void 0?e.Vertices.a:[],i.vertexIndices=e.PolygonVertexIndex!==void 0?e.PolygonVertexIndex.a:[],e.LayerElementColor&&(i.color=this.parseVertexColors(e.LayerElementColor[0])),e.LayerElementMaterial&&(i.material=this.parseMaterialIndices(e.LayerElementMaterial[0])),e.LayerElementNormal&&(i.normal=this.parseNormals(e.LayerElementNormal[0])),e.LayerElementUV){i.uv=[];let s=0;for(;e.LayerElementUV[s];)e.LayerElementUV[s].UV&&i.uv.push(this.parseUVs(e.LayerElementUV[s])),s++}return i.weightTable={},t!==null&&(i.skeleton=t,t.rawBones.forEach(function(s,n){s.indices.forEach(function(o,a){i.weightTable[o]===void 0&&(i.weightTable[o]=[]),i.weightTable[o].push({id:n,weight:s.weights[a]})})})),i}genBuffers(e){const t={vertex:[],normal:[],colors:[],uvs:[],materialIndex:[],vertexWeights:[],weightsIndices:[]};let i=0,s=0,n=!1,o=[],a=[],r=[],l=[],d=[],c=[];const h=this;return e.vertexIndices.forEach(function(u,y){let b,w=!1;u<0&&(u=u^-1,w=!0);let x=[],v=[];if(o.push(u*3,u*3+1,u*3+2),e.color){const S=Wt(y,i,u,e.color);r.push(S[0],S[1],S[2])}if(e.skeleton){if(e.weightTable[u]!==void 0&&e.weightTable[u].forEach(function(S){v.push(S.weight),x.push(S.id)}),v.length>4){n||(console.warn("THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights."),n=!0);const S=[0,0,0,0],C=[0,0,0,0];v.forEach(function(P,L){let M=P,_=x[L];C.forEach(function(U,q,oe){if(M>U){oe[q]=M,M=U;const W=S[q];S[q]=_,_=W}})}),x=S,v=C}for(;v.length<4;)v.push(0),x.push(0);for(let S=0;S<4;++S)d.push(v[S]),c.push(x[S])}if(e.normal){const S=Wt(y,i,u,e.normal);a.push(S[0],S[1],S[2])}e.material&&e.material.mappingType!=="AllSame"&&(b=Wt(y,i,u,e.material)[0],b<0&&(h.negativeMaterialIndices=!0,b=0)),e.uv&&e.uv.forEach(function(S,C){const P=Wt(y,i,u,S);l[C]===void 0&&(l[C]=[]),l[C].push(P[0]),l[C].push(P[1])}),s++,w&&(h.genFace(t,e,o,b,a,r,l,d,c,s),i++,s=0,o=[],a=[],r=[],l=[],d=[],c=[])}),t}getNormalNewell(e){const t=new m(0,0,0);for(let i=0;i<e.length;i++){const s=e[i],n=e[(i+1)%e.length];t.x+=(s.y-n.y)*(s.z+n.z),t.y+=(s.z-n.z)*(s.x+n.x),t.z+=(s.x-n.x)*(s.y+n.y)}return t.normalize(),t}getNormalTangentAndBitangent(e){const t=this.getNormalNewell(e),s=(Math.abs(t.z)>.5?new m(0,1,0):new m(0,0,1)).cross(t).normalize(),n=t.clone().cross(s).normalize();return{normal:t,tangent:s,bitangent:n}}flattenVertex(e,t,i){return new le(e.dot(t),e.dot(i))}genFace(e,t,i,s,n,o,a,r,l,d){let c;if(d>3){const h=[];for(let w=0;w<i.length;w+=3)h.push(new m(t.vertexPositions[i[w]],t.vertexPositions[i[w+1]],t.vertexPositions[i[w+2]]));const{tangent:u,bitangent:y}=this.getNormalTangentAndBitangent(h),b=[];for(const w of h)b.push(this.flattenVertex(w,u,y));c=Rn.triangulateShape(b,[])}else c=[[0,1,2]];for(const[h,u,y]of c)e.vertex.push(t.vertexPositions[i[h*3]]),e.vertex.push(t.vertexPositions[i[h*3+1]]),e.vertex.push(t.vertexPositions[i[h*3+2]]),e.vertex.push(t.vertexPositions[i[u*3]]),e.vertex.push(t.vertexPositions[i[u*3+1]]),e.vertex.push(t.vertexPositions[i[u*3+2]]),e.vertex.push(t.vertexPositions[i[y*3]]),e.vertex.push(t.vertexPositions[i[y*3+1]]),e.vertex.push(t.vertexPositions[i[y*3+2]]),t.skeleton&&(e.vertexWeights.push(r[h*4]),e.vertexWeights.push(r[h*4+1]),e.vertexWeights.push(r[h*4+2]),e.vertexWeights.push(r[h*4+3]),e.vertexWeights.push(r[u*4]),e.vertexWeights.push(r[u*4+1]),e.vertexWeights.push(r[u*4+2]),e.vertexWeights.push(r[u*4+3]),e.vertexWeights.push(r[y*4]),e.vertexWeights.push(r[y*4+1]),e.vertexWeights.push(r[y*4+2]),e.vertexWeights.push(r[y*4+3]),e.weightsIndices.push(l[h*4]),e.weightsIndices.push(l[h*4+1]),e.weightsIndices.push(l[h*4+2]),e.weightsIndices.push(l[h*4+3]),e.weightsIndices.push(l[u*4]),e.weightsIndices.push(l[u*4+1]),e.weightsIndices.push(l[u*4+2]),e.weightsIndices.push(l[u*4+3]),e.weightsIndices.push(l[y*4]),e.weightsIndices.push(l[y*4+1]),e.weightsIndices.push(l[y*4+2]),e.weightsIndices.push(l[y*4+3])),t.color&&(e.colors.push(o[h*3]),e.colors.push(o[h*3+1]),e.colors.push(o[h*3+2]),e.colors.push(o[u*3]),e.colors.push(o[u*3+1]),e.colors.push(o[u*3+2]),e.colors.push(o[y*3]),e.colors.push(o[y*3+1]),e.colors.push(o[y*3+2])),t.material&&t.material.mappingType!=="AllSame"&&(e.materialIndex.push(s),e.materialIndex.push(s),e.materialIndex.push(s)),t.normal&&(e.normal.push(n[h*3]),e.normal.push(n[h*3+1]),e.normal.push(n[h*3+2]),e.normal.push(n[u*3]),e.normal.push(n[u*3+1]),e.normal.push(n[u*3+2]),e.normal.push(n[y*3]),e.normal.push(n[y*3+1]),e.normal.push(n[y*3+2])),t.uv&&t.uv.forEach(function(b,w){e.uvs[w]===void 0&&(e.uvs[w]=[]),e.uvs[w].push(a[w][h*2]),e.uvs[w].push(a[w][h*2+1]),e.uvs[w].push(a[w][u*2]),e.uvs[w].push(a[w][u*2+1]),e.uvs[w].push(a[w][y*2]),e.uvs[w].push(a[w][y*2+1])})}addMorphTargets(e,t,i,s){if(i.length===0)return;e.morphTargetsRelative=!0,e.morphAttributes.position=[];const n=this;i.forEach(function(o){o.rawTargets.forEach(function(a){const r=I.Objects.Geometry[a.geoID];r!==void 0&&n.genMorphGeometry(e,t,r,s,a.name)})})}genMorphGeometry(e,t,i,s,n){const o=t.PolygonVertexIndex!==void 0?t.PolygonVertexIndex.a:[],a=i.Vertices!==void 0?i.Vertices.a:[],r=i.Indexes!==void 0?i.Indexes.a:[],l=e.attributes.position.count*3,d=new Float32Array(l);for(let y=0;y<r.length;y++){const b=r[y]*3;d[b]=a[y*3],d[b+1]=a[y*3+1],d[b+2]=a[y*3+2]}const c={vertexIndices:o,vertexPositions:d},h=this.genBuffers(c),u=new $e(h.vertex,3);u.name=n||i.attrName,u.applyMatrix4(s),e.morphAttributes.position.push(u)}parseNormals(e){const t=e.MappingInformationType,i=e.ReferenceInformationType,s=e.Normals.a;let n=[];return i==="IndexToDirect"&&("NormalIndex"in e?n=e.NormalIndex.a:"NormalsIndex"in e&&(n=e.NormalsIndex.a)),{dataSize:3,buffer:s,indices:n,mappingType:t,referenceType:i}}parseUVs(e){const t=e.MappingInformationType,i=e.ReferenceInformationType,s=e.UV.a;let n=[];return i==="IndexToDirect"&&(n=e.UVIndex.a),{dataSize:2,buffer:s,indices:n,mappingType:t,referenceType:i}}parseVertexColors(e){const t=e.MappingInformationType,i=e.ReferenceInformationType,s=e.Colors.a;let n=[];i==="IndexToDirect"&&(n=e.ColorIndex.a);for(let o=0,a=new B;o<s.length;o+=4)a.fromArray(s,o).convertSRGBToLinear().toArray(s,o);return{dataSize:4,buffer:s,indices:n,mappingType:t,referenceType:i}}parseMaterialIndices(e){const t=e.MappingInformationType,i=e.ReferenceInformationType;if(t==="NoMappingInformation")return{dataSize:1,buffer:[0],indices:[0],mappingType:"AllSame",referenceType:i};const s=e.Materials.a,n=[];for(let o=0;o<s.length;++o)n.push(o);return{dataSize:1,buffer:s,indices:n,mappingType:t,referenceType:i}}parseNurbsGeometry(e){const t=parseInt(e.Order);if(isNaN(t))return console.error("THREE.FBXLoader: Invalid Order %s given for geometry ID: %s",e.Order,e.id),new Oe;const i=t-1,s=e.KnotVector.a,n=[],o=e.Points.a;for(let c=0,h=o.length;c<h;c+=4)n.push(new ri().fromArray(o,c));let a,r;if(e.Form==="Closed")n.push(n[0]);else if(e.Form==="Periodic"){a=i,r=s.length-1-a;for(let c=0;c<i;++c)n.push(n[c])}const d=new Wo(i,s,n,a,r).getPoints(n.length*12);return new Oe().setFromPoints(d)}}class Jo{parse(){const e=[],t=this.parseClips();if(t!==void 0)for(const i in t){const s=t[i],n=this.addClip(s);e.push(n)}return e}parseClips(){if(I.Objects.AnimationCurve===void 0)return;const e=this.parseAnimationCurveNodes();this.parseAnimationCurves(e);const t=this.parseAnimationLayers(e);return this.parseAnimStacks(t)}parseAnimationCurveNodes(){const e=I.Objects.AnimationCurveNode,t=new Map;for(const i in e){const s=e[i];if(s.attrName.match(/S|R|T|DeformPercent/)!==null){const n={id:s.id,attr:s.attrName,curves:{}};t.set(n.id,n)}}return t}parseAnimationCurves(e){const t=I.Objects.AnimationCurve;for(const i in t){const s={id:t[i].id,times:t[i].KeyTime.a.map(na),values:t[i].KeyValueFloat.a},n=ee.get(s.id);if(n!==void 0){const o=n.parents[0].ID,a=n.parents[0].relationship;a.match(/X/)?e.get(o).curves.x=s:a.match(/Y/)?e.get(o).curves.y=s:a.match(/Z/)?e.get(o).curves.z=s:a.match(/DeformPercent/)&&e.has(o)&&(e.get(o).curves.morph=s)}}}parseAnimationLayers(e){const t=I.Objects.AnimationLayer,i=new Map;for(const s in t){const n=[],o=ee.get(parseInt(s));o!==void 0&&(o.children.forEach(function(r,l){if(e.has(r.ID)){const d=e.get(r.ID);if(d.curves.x!==void 0||d.curves.y!==void 0||d.curves.z!==void 0){if(n[l]===void 0){const c=ee.get(r.ID).parents.filter(function(h){return h.relationship!==void 0})[0].ID;if(c!==void 0){const h=I.Objects.Model[c.toString()];if(h===void 0){console.warn("THREE.FBXLoader: Encountered a unused curve.",r);return}const u={modelName:h.attrName?Ht.sanitizeNodeName(h.attrName):"",ID:h.id,initialPosition:[0,0,0],initialRotation:[0,0,0],initialScale:[1,1,1]};he.traverse(function(y){y.ID===h.id&&(u.transform=y.matrix,y.userData.transformData&&(u.eulerOrder=y.userData.transformData.eulerOrder))}),u.transform||(u.transform=new N),"PreRotation"in h&&(u.preRotation=h.PreRotation.value),"PostRotation"in h&&(u.postRotation=h.PostRotation.value),n[l]=u}}n[l]&&(n[l][d.attr]=d)}else if(d.curves.morph!==void 0){if(n[l]===void 0){const c=ee.get(r.ID).parents.filter(function(x){return x.relationship!==void 0})[0].ID,h=ee.get(c).parents[0].ID,u=ee.get(h).parents[0].ID,y=ee.get(u).parents[0].ID,b=I.Objects.Model[y],w={modelName:b.attrName?Ht.sanitizeNodeName(b.attrName):"",morphName:I.Objects.Deformer[c].attrName};n[l]=w}n[l][d.attr]=d}}}),i.set(parseInt(s),n))}return i}parseAnimStacks(e){const t=I.Objects.AnimationStack,i={};for(const s in t){const n=ee.get(parseInt(s)).children;n.length>1&&console.warn("THREE.FBXLoader: Encountered an animation stack with multiple layers, this is currently not supported. Ignoring subsequent layers.");const o=e.get(n[0].ID);i[s]={name:t[s].attrName,layer:o}}return i}addClip(e){let t=[];const i=this;return e.layer.forEach(function(s){t=t.concat(i.generateTracks(s))}),new Ds(e.name,-1,t)}generateTracks(e){const t=[];let i=new m,s=new m;if(e.transform&&e.transform.decompose(i,new G,s),i=i.toArray(),s=s.toArray(),e.T!==void 0&&Object.keys(e.T.curves).length>0){const n=this.generateVectorTrack(e.modelName,e.T.curves,i,"position");n!==void 0&&t.push(n)}if(e.R!==void 0&&Object.keys(e.R.curves).length>0){const n=this.generateRotationTrack(e.modelName,e.R.curves,e.preRotation,e.postRotation,e.eulerOrder);n!==void 0&&t.push(n)}if(e.S!==void 0&&Object.keys(e.S.curves).length>0){const n=this.generateVectorTrack(e.modelName,e.S.curves,s,"scale");n!==void 0&&t.push(n)}if(e.DeformPercent!==void 0){const n=this.generateMorphTrack(e);n!==void 0&&t.push(n)}return t}generateVectorTrack(e,t,i,s){const n=this.getTimesForAllAxes(t),o=this.getKeyframeTrackValues(n,t,i);return new _i(e+"."+s,n,o)}generateRotationTrack(e,t,i,s,n){let o,a;if(t.x!==void 0&&t.y!==void 0&&t.z!==void 0){const c=this.interpolateRotations(t.x,t.y,t.z,n);o=c[0],a=c[1]}i!==void 0&&(i=i.map(R.degToRad),i.push(n),i=new ne().fromArray(i),i=new G().setFromEuler(i)),s!==void 0&&(s=s.map(R.degToRad),s.push(n),s=new ne().fromArray(s),s=new G().setFromEuler(s).invert());const r=new G,l=new ne,d=[];if(!a||!o)return new ni(e+".quaternion",[],[]);for(let c=0;c<a.length;c+=3)l.set(a[c],a[c+1],a[c+2],n),r.setFromEuler(l),i!==void 0&&r.premultiply(i),s!==void 0&&r.multiply(s),c>2&&new G().fromArray(d,(c-3)/3*4).dot(r)<0&&r.set(-r.x,-r.y,-r.z,-r.w),r.toArray(d,c/3*4);return new ni(e+".quaternion",o,d)}generateMorphTrack(e){const t=e.DeformPercent.curves.morph,i=t.values.map(function(n){return n/100}),s=he.getObjectByName(e.modelName).morphTargetDictionary[e.morphName];return new Ii(e.modelName+".morphTargetInfluences["+s+"]",t.times,i)}getTimesForAllAxes(e){let t=[];if(e.x!==void 0&&(t=t.concat(e.x.times)),e.y!==void 0&&(t=t.concat(e.y.times)),e.z!==void 0&&(t=t.concat(e.z.times)),t=t.sort(function(i,s){return i-s}),t.length>1){let i=1,s=t[0];for(let n=1;n<t.length;n++){const o=t[n];o!==s&&(t[i]=o,s=o,i++)}t=t.slice(0,i)}return t}getKeyframeTrackValues(e,t,i){const s=i,n=[];let o=-1,a=-1,r=-1;return e.forEach(function(l){if(t.x&&(o=t.x.times.indexOf(l)),t.y&&(a=t.y.times.indexOf(l)),t.z&&(r=t.z.times.indexOf(l)),o!==-1){const d=t.x.values[o];n.push(d),s[0]=d}else n.push(s[0]);if(a!==-1){const d=t.y.values[a];n.push(d),s[1]=d}else n.push(s[1]);if(r!==-1){const d=t.z.values[r];n.push(d),s[2]=d}else n.push(s[2])}),n}interpolateRotations(e,t,i,s){const n=[],o=[];n.push(e.times[0]),o.push(R.degToRad(e.values[0])),o.push(R.degToRad(t.values[0])),o.push(R.degToRad(i.values[0]));for(let a=1;a<e.values.length;a++){const r=[e.values[a-1],t.values[a-1],i.values[a-1]];if(isNaN(r[0])||isNaN(r[1])||isNaN(r[2]))continue;const l=r.map(R.degToRad),d=[e.values[a],t.values[a],i.values[a]];if(isNaN(d[0])||isNaN(d[1])||isNaN(d[2]))continue;const c=d.map(R.degToRad),h=[d[0]-r[0],d[1]-r[1],d[2]-r[2]],u=[Math.abs(h[0]),Math.abs(h[1]),Math.abs(h[2])];if(u[0]>=180||u[1]>=180||u[2]>=180){const b=Math.max(...u)/180,w=new ne(...l,s),x=new ne(...c,s),v=new G().setFromEuler(w),S=new G().setFromEuler(x);v.dot(S)&&S.set(-S.x,-S.y,-S.z,-S.w);const C=e.times[a-1],P=e.times[a]-C,L=new G,M=new ne;for(let _=0;_<1;_+=1/b)L.copy(v.clone().slerp(S.clone(),_)),n.push(C+_*P),M.setFromQuaternion(L,s),o.push(M.x),o.push(M.y),o.push(M.z)}else n.push(e.times[a]),o.push(R.degToRad(e.values[a])),o.push(R.degToRad(t.values[a])),o.push(R.degToRad(i.values[a]))}return[n,o]}}class ea{getPrevNode(){return this.nodeStack[this.currentIndent-2]}getCurrentNode(){return this.nodeStack[this.currentIndent-1]}getCurrentProp(){return this.currentProp}pushStack(e){this.nodeStack.push(e),this.currentIndent+=1}popStack(){this.nodeStack.pop(),this.currentIndent-=1}setCurrentProp(e,t){this.currentProp=e,this.currentPropName=t}parse(e){this.currentIndent=0,this.allNodes=new sn,this.nodeStack=[],this.currentProp=[],this.currentPropName="";const t=this,i=e.split(/[\r\n]+/);return i.forEach(function(s,n){const o=s.match(/^[\s\t]*;/),a=s.match(/^[\s\t]*$/);if(o||a)return;const r=s.match("^\\t{"+t.currentIndent+"}(\\w+):(.*){",""),l=s.match("^\\t{"+t.currentIndent+"}(\\w+):[\\s\\t\\r\\n](.*)"),d=s.match("^\\t{"+(t.currentIndent-1)+"}}");r?t.parseNodeBegin(s,r):l?t.parseNodeProperty(s,l,i[++n]):d?t.popStack():s.match(/^[^\s\t}]/)&&t.parseNodePropertyContinued(s)}),this.allNodes}parseNodeBegin(e,t){const i=t[1].trim().replace(/^"/,"").replace(/"$/,""),s=t[2].split(",").map(function(r){return r.trim().replace(/^"/,"").replace(/"$/,"")}),n={name:i},o=this.parseNodeAttr(s),a=this.getCurrentNode();this.currentIndent===0?this.allNodes.add(i,n):i in a?(i==="PoseNode"?a.PoseNode.push(n):a[i].id!==void 0&&(a[i]={},a[i][a[i].id]=a[i]),o.id!==""&&(a[i][o.id]=n)):typeof o.id=="number"?(a[i]={},a[i][o.id]=n):i!=="Properties70"&&(i==="PoseNode"?a[i]=[n]:a[i]=n),typeof o.id=="number"&&(n.id=o.id),o.name!==""&&(n.attrName=o.name),o.type!==""&&(n.attrType=o.type),this.pushStack(n)}parseNodeAttr(e){let t=e[0];e[0]!==""&&(t=parseInt(e[0]),isNaN(t)&&(t=e[0]));let i="",s="";return e.length>1&&(i=e[1].replace(/^(\w+)::/,""),s=e[2]),{id:t,name:i,type:s}}parseNodeProperty(e,t,i){let s=t[1].replace(/^"/,"").replace(/"$/,"").trim(),n=t[2].replace(/^"/,"").replace(/"$/,"").trim();s==="Content"&&n===","&&(n=i.replace(/"/g,"").replace(/,$/,"").trim());const o=this.getCurrentNode();if(o.name==="Properties70"){this.parseNodeSpecialProperty(e,s,n);return}if(s==="C"){const r=n.split(",").slice(1),l=parseInt(r[0]),d=parseInt(r[1]);let c=n.split(",").slice(3);c=c.map(function(h){return h.trim().replace(/^"/,"")}),s="connections",n=[l,d],aa(n,c),o[s]===void 0&&(o[s]=[])}s==="Node"&&(o.id=n),s in o&&Array.isArray(o[s])?o[s].push(n):s!=="a"?o[s]=n:o.a=n,this.setCurrentProp(o,s),s==="a"&&n.slice(-1)!==","&&(o.a=wi(n))}parseNodePropertyContinued(e){const t=this.getCurrentNode();t.a+=e,e.slice(-1)!==","&&(t.a=wi(t.a))}parseNodeSpecialProperty(e,t,i){const s=i.split('",').map(function(d){return d.trim().replace(/^\"/,"").replace(/\s/,"_")}),n=s[0],o=s[1],a=s[2],r=s[3];let l=s[4];switch(o){case"int":case"enum":case"bool":case"ULongLong":case"double":case"Number":case"FieldOfView":l=parseFloat(l);break;case"Color":case"ColorRGB":case"Vector3D":case"Lcl_Translation":case"Lcl_Rotation":case"Lcl_Scaling":l=wi(l);break}this.getPrevNode()[n]={type:o,type2:a,flag:r,value:l},this.setCurrentProp(this.getPrevNode(),n)}}class ta{parse(e){const t=new hs(e);t.skip(23);const i=t.getUint32();if(i<6400)throw new Error("THREE.FBXLoader: FBX version not supported, FileVersion: "+i);const s=new sn;for(;!this.endOfContent(t);){const n=this.parseNode(t,i);n!==null&&s.add(n.name,n)}return s}endOfContent(e){return e.size()%16===0?(e.getOffset()+160+16&-16)>=e.size():e.getOffset()+160+16>=e.size()}parseNode(e,t){const i={},s=t>=7500?e.getUint64():e.getUint32(),n=t>=7500?e.getUint64():e.getUint32();t>=7500?e.getUint64():e.getUint32();const o=e.getUint8(),a=e.getString(o);if(s===0)return null;const r=[];for(let h=0;h<n;h++)r.push(this.parseProperty(e));const l=r.length>0?r[0]:"",d=r.length>1?r[1]:"",c=r.length>2?r[2]:"";for(i.singleProperty=n===1&&e.getOffset()===s;s>e.getOffset();){const h=this.parseNode(e,t);h!==null&&this.parseSubNode(a,i,h)}return i.propertyList=r,typeof l=="number"&&(i.id=l),d!==""&&(i.attrName=d),c!==""&&(i.attrType=c),a!==""&&(i.name=a),i}parseSubNode(e,t,i){if(i.singleProperty===!0){const s=i.propertyList[0];Array.isArray(s)?(t[i.name]=i,i.a=s):t[i.name]=s}else if(e==="Connections"&&i.name==="C"){const s=[];i.propertyList.forEach(function(n,o){o!==0&&s.push(n)}),t.connections===void 0&&(t.connections=[]),t.connections.push(s)}else if(i.name==="Properties70")Object.keys(i).forEach(function(n){t[n]=i[n]});else if(e==="Properties70"&&i.name==="P"){let s=i.propertyList[0],n=i.propertyList[1];const o=i.propertyList[2],a=i.propertyList[3];let r;s.indexOf("Lcl ")===0&&(s=s.replace("Lcl ","Lcl_")),n.indexOf("Lcl ")===0&&(n=n.replace("Lcl ","Lcl_")),n==="Color"||n==="ColorRGB"||n==="Vector"||n==="Vector3D"||n.indexOf("Lcl_")===0?r=[i.propertyList[4],i.propertyList[5],i.propertyList[6]]:r=i.propertyList[4],t[s]={type:n,type2:o,flag:a,value:r}}else t[i.name]===void 0?typeof i.id=="number"?(t[i.name]={},t[i.name][i.id]=i):t[i.name]=i:i.name==="PoseNode"?(Array.isArray(t[i.name])||(t[i.name]=[t[i.name]]),t[i.name].push(i)):t[i.name][i.id]===void 0&&(t[i.name][i.id]=i)}parseProperty(e){const t=e.getString(1);let i;switch(t){case"C":return e.getBoolean();case"D":return e.getFloat64();case"F":return e.getFloat32();case"I":return e.getInt32();case"L":return e.getInt64();case"R":return i=e.getUint32(),e.getArrayBuffer(i);case"S":return i=e.getUint32(),e.getString(i);case"Y":return e.getInt16();case"b":case"c":case"d":case"f":case"i":case"l":const s=e.getUint32(),n=e.getUint32(),o=e.getUint32();if(n===0)switch(t){case"b":case"c":return e.getBooleanArray(s);case"d":return e.getFloat64Array(s);case"f":return e.getFloat32Array(s);case"i":return e.getInt32Array(s);case"l":return e.getInt64Array(s)}const a=jo(new Uint8Array(e.getArrayBuffer(o))),r=new hs(a.buffer);switch(t){case"b":case"c":return r.getBooleanArray(s);case"d":return r.getFloat64Array(s);case"f":return r.getFloat32Array(s);case"i":return r.getInt32Array(s);case"l":return r.getInt64Array(s)}break;default:throw new Error("THREE.FBXLoader: Unknown property type "+t)}}}class hs{constructor(e,t){this.dv=new DataView(e),this.offset=0,this.littleEndian=t!==void 0?t:!0,this._textDecoder=new TextDecoder}getOffset(){return this.offset}size(){return this.dv.buffer.byteLength}skip(e){this.offset+=e}getBoolean(){return(this.getUint8()&1)===1}getBooleanArray(e){const t=[];for(let i=0;i<e;i++)t.push(this.getBoolean());return t}getUint8(){const e=this.dv.getUint8(this.offset);return this.offset+=1,e}getInt16(){const e=this.dv.getInt16(this.offset,this.littleEndian);return this.offset+=2,e}getInt32(){const e=this.dv.getInt32(this.offset,this.littleEndian);return this.offset+=4,e}getInt32Array(e){const t=[];for(let i=0;i<e;i++)t.push(this.getInt32());return t}getUint32(){const e=this.dv.getUint32(this.offset,this.littleEndian);return this.offset+=4,e}getInt64(){let e,t;return this.littleEndian?(e=this.getUint32(),t=this.getUint32()):(t=this.getUint32(),e=this.getUint32()),t&2147483648?(t=~t&4294967295,e=~e&4294967295,e===4294967295&&(t=t+1&4294967295),e=e+1&4294967295,-(t*4294967296+e)):t*4294967296+e}getInt64Array(e){const t=[];for(let i=0;i<e;i++)t.push(this.getInt64());return t}getUint64(){let e,t;return this.littleEndian?(e=this.getUint32(),t=this.getUint32()):(t=this.getUint32(),e=this.getUint32()),t*4294967296+e}getFloat32(){const e=this.dv.getFloat32(this.offset,this.littleEndian);return this.offset+=4,e}getFloat32Array(e){const t=[];for(let i=0;i<e;i++)t.push(this.getFloat32());return t}getFloat64(){const e=this.dv.getFloat64(this.offset,this.littleEndian);return this.offset+=8,e}getFloat64Array(e){const t=[];for(let i=0;i<e;i++)t.push(this.getFloat64());return t}getArrayBuffer(e){const t=this.dv.buffer.slice(this.offset,this.offset+e);return this.offset+=e,t}getString(e){const t=this.offset;let i=new Uint8Array(this.dv.buffer,t,e);this.skip(e);const s=i.indexOf(0);return s>=0&&(i=new Uint8Array(this.dv.buffer,t,s)),this._textDecoder.decode(i)}}class sn{add(e,t){this[e]=t}}function ia(p){const e="Kaydara FBX Binary  \0";return p.byteLength>=e.length&&e===an(p,0,e.length)}function sa(p){const e=["K","a","y","d","a","r","a","\\","F","B","X","\\","B","i","n","a","r","y","\\","\\"];let t=0;function i(s){const n=p[s-1];return p=p.slice(t+s),t++,n}for(let s=0;s<e.length;++s)if(i(1)===e[s])return!1;return!0}function ps(p){const e=/FBXVersion: (\d+)/,t=p.match(e);if(t)return parseInt(t[1]);throw new Error("THREE.FBXLoader: Cannot find the version number for the file given.")}function na(p){return p/46186158e3}const oa=[];function Wt(p,e,t,i){let s;switch(i.mappingType){case"ByPolygonVertex":s=p;break;case"ByPolygon":s=e;break;case"ByVertice":s=t;break;case"AllSame":s=i.indices[0];break;default:console.warn("THREE.FBXLoader: unknown attribute mapping type "+i.mappingType)}i.referenceType==="IndexToDirect"&&(s=i.indices[s]);const n=s*i.dataSize,o=n+i.dataSize;return ra(oa,i.buffer,n,o)}const bi=new ne,gt=new m;function nn(p){const e=new N,t=new N,i=new N,s=new N,n=new N,o=new N,a=new N,r=new N,l=new N,d=new N,c=new N,h=new N,u=p.inheritType?p.inheritType:0;if(p.translation&&e.setPosition(gt.fromArray(p.translation)),p.preRotation){const q=p.preRotation.map(R.degToRad);q.push(p.eulerOrder||ne.DEFAULT_ORDER),t.makeRotationFromEuler(bi.fromArray(q))}if(p.rotation){const q=p.rotation.map(R.degToRad);q.push(p.eulerOrder||ne.DEFAULT_ORDER),i.makeRotationFromEuler(bi.fromArray(q))}if(p.postRotation){const q=p.postRotation.map(R.degToRad);q.push(p.eulerOrder||ne.DEFAULT_ORDER),s.makeRotationFromEuler(bi.fromArray(q)),s.invert()}p.scale&&n.scale(gt.fromArray(p.scale)),p.scalingOffset&&a.setPosition(gt.fromArray(p.scalingOffset)),p.scalingPivot&&o.setPosition(gt.fromArray(p.scalingPivot)),p.rotationOffset&&r.setPosition(gt.fromArray(p.rotationOffset)),p.rotationPivot&&l.setPosition(gt.fromArray(p.rotationPivot)),p.parentMatrixWorld&&(c.copy(p.parentMatrix),d.copy(p.parentMatrixWorld));const y=t.clone().multiply(i).multiply(s),b=new N;b.extractRotation(d);const w=new N;w.copyPosition(d);const x=w.clone().invert().multiply(d),v=b.clone().invert().multiply(x),S=n,C=new N;if(u===0)C.copy(b).multiply(y).multiply(v).multiply(S);else if(u===1)C.copy(b).multiply(v).multiply(y).multiply(S);else{const oe=new N().scale(new m().setFromMatrixScale(c)).clone().invert(),W=v.clone().multiply(oe);C.copy(b).multiply(y).multiply(W).multiply(S)}const P=l.clone().invert(),L=o.clone().invert();let M=e.clone().multiply(r).multiply(l).multiply(t).multiply(i).multiply(s).multiply(P).multiply(a).multiply(o).multiply(n).multiply(L);const _=new N().copyPosition(M),U=d.clone().multiply(_);return h.copyPosition(U),M=h.clone().multiply(C),M.premultiply(d.invert()),M}function on(p){p=p||0;const e=["ZYX","YZX","XZY","ZXY","YXZ","XYZ"];return p===6?(console.warn("THREE.FBXLoader: unsupported Euler Order: Spherical XYZ. Animations and rotations may be incorrect."),e[0]):e[p]}function wi(p){return p.split(",").map(function(t){return parseFloat(t)})}function an(p,e,t){return e===void 0&&(e=0),t===void 0&&(t=p.byteLength),new TextDecoder().decode(new Uint8Array(p,e,t))}function aa(p,e){for(let t=0,i=p.length,s=e.length;t<s;t++,i++)p[i]=e[t]}function ra(p,e,t,i){for(let s=t,n=0;s<i;s++,n++)p[n]=e[s];return p}const la="modulepreload",ca=function(p,e){return new URL(p,e).href},us={},da=function(e,t,i){let s=Promise.resolve();if(t&&t.length>0){const o=document.getElementsByTagName("link"),a=document.querySelector("meta[property=csp-nonce]"),r=a?.nonce||a?.getAttribute("nonce");s=Promise.allSettled(t.map(l=>{if(l=ca(l,i),l in us)return;us[l]=!0;const d=l.endsWith(".css"),c=d?'[rel="stylesheet"]':"";if(!!i)for(let y=o.length-1;y>=0;y--){const b=o[y];if(b.href===l&&(!d||b.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${l}"]${c}`))return;const u=document.createElement("link");if(u.rel=d?"stylesheet":la,d||(u.as="script"),u.crossOrigin="",u.href=l,r&&u.setAttribute("nonce",r),document.head.appendChild(u),d)return new Promise((y,b)=>{u.addEventListener("load",y),u.addEventListener("error",()=>b(new Error(`Unable to preload CSS for ${l}`)))})}))}function n(o){const a=new Event("vite:preloadError",{cancelable:!0});if(a.payload=o,window.dispatchEvent(a),!a.defaultPrevented)throw o}return s.then(o=>{for(const a of o||[])a.status==="rejected"&&n(a.reason);return e().catch(n)})},ms="tony-stonks-story-progress";function xi(){return{currentChapter:1,currentLevel:"story_1_office",totalStonks:0,lifetimeStonks:0,upgrades:{speed:0,jumpHeight:0,spinSpeed:0,grindBalance:0,manualBalance:0},cosmetics:{tieColor:"#ff0000",tiePattern:"solid",shirtColor:"#ffffff",pantsColor:"#2a2a2a",shoesColor:"#000000",chairUpholstery:"#1a1a2e"},levelProgress:{story_1_office:{unlocked:!0,completed:!1,bestScore:0,bestTime:0,stonksEarned:0,checkpointReached:-1}},storyFlags:{}}}const ha={speed:[1e3,2500,5e3,1e4,25e3],jumpHeight:[1e3,2500,5e3,1e4,25e3],spinSpeed:[750,2e3,4e3,8e3,2e4],grindBalance:[1500,3e3,6e3,12e3,3e4],manualBalance:[1500,3e3,6e3,12e3,3e4]},pa={speed:[1,1.1,1.2,1.35,1.5,1.75],jumpHeight:[1,1.1,1.2,1.35,1.5,1.75],spinSpeed:[1,1.15,1.3,1.5,1.75,2],grindBalance:[.5,.4,.3,.22,.15,.1],manualBalance:[.5,.4,.3,.22,.15,.1]},ua={tieColor:500,tiePattern:1e3,shirtColor:750,pantsColor:750,shoesColor:500,chairUpholstery:2e3};class ma{state;constructor(){this.state=this.load()}load(){try{const e=localStorage.getItem(ms);if(e){const t=JSON.parse(e);return{...xi(),...t}}}catch(e){console.warn("Failed to load story progress:",e)}return xi()}save(){try{localStorage.setItem(ms,JSON.stringify(this.state))}catch(e){console.warn("Failed to save story progress:",e)}}reset(){this.state=xi(),this.save()}getState(){return{...this.state}}getStonks(){return this.state.totalStonks}addStonks(e){this.state.totalStonks+=e,this.state.lifetimeStonks+=e,this.save()}spendStonks(e){return this.state.totalStonks<e?!1:(this.state.totalStonks-=e,this.save(),!0)}getUpgradeLevel(e){return this.state.upgrades[e]}getUpgradeEffect(e){const t=this.state.upgrades[e];return pa[e][t]}getUpgradeCost(e){const t=this.state.upgrades[e];return t>=5?null:ha[e][t]}purchaseUpgrade(e){const t=this.getUpgradeCost(e);return t===null||!this.spendStonks(t)?!1:(this.state.upgrades[e]++,this.save(),!0)}getCosmetic(e){return this.state.cosmetics[e]}setCosmetic(e,t){const i=ua[e]||0;return i>0&&!this.spendStonks(i)?!1:(this.state.cosmetics[e]=t,this.save(),!0)}isLevelUnlocked(e){return this.state.levelProgress[e]?.unlocked??!1}isLevelCompleted(e){return this.state.levelProgress[e]?.completed??!1}unlockLevel(e){this.state.levelProgress[e]?this.state.levelProgress[e].unlocked=!0:this.state.levelProgress[e]={unlocked:!0,completed:!1,bestScore:0,bestTime:0,stonksEarned:0,checkpointReached:-1},this.save()}completeLevel(e,t,i,s,n){this.state.levelProgress[e]||(this.state.levelProgress[e]={unlocked:!0,completed:!1,bestScore:0,bestTime:0,stonksEarned:0,checkpointReached:-1});const o=this.state.levelProgress[e];o.completed=!0,t>o.bestScore&&(o.bestScore=t),(i<o.bestTime||o.bestTime===0)&&(o.bestTime=i),o.stonksEarned+=s,n&&this.unlockLevel(n),this.save()}setCheckpoint(e,t){if(!this.state.levelProgress[e])this.state.levelProgress[e]={unlocked:!0,completed:!1,bestScore:0,bestTime:0,stonksEarned:0,checkpointReached:t};else{const i=this.state.levelProgress[e].checkpointReached;t>i&&(this.state.levelProgress[e].checkpointReached=t)}this.save()}getCheckpoint(e){return this.state.levelProgress[e]?.checkpointReached??-1}setFlag(e,t=!0){this.state.storyFlags[e]=t,this.save()}getFlag(e){return this.state.storyFlags[e]??!1}setCurrentLevel(e){this.state.currentLevel=e,this.save()}getCurrentLevel(){return this.state.currentLevel}}const Ie=new ma,fa={id:"story_1_office",chapter:1,storyOrder:1,nextLevel:"story_2_stairwell",name:"Office Escape",subtitle:"The Day Everything Changed",description:"SEC agents have stormed the building! Grab your office chair and GET OUT!",skyColor:"#111111",skyColorTop:"#111111",skyColorBottom:"#1a1a1a",fogColor:"#2a2a2e",fogNear:25,fogFar:60,ambientLight:1.5,sunIntensity:0,groundSize:80,groundColor:"#7a7a6a",spawnPoint:{position:[-28,1,-30],rotation:90},bounds:{minX:-38,maxX:38,minZ:-38,maxZ:38},checkpoints:[{position:[0,1,28],rotation:0,name:"Reached the stairwell",dialogue:["TONY: There's the stairs! Time to ride!"]}],objects:[{type:"wall_indoor",position:[0,4,38.5],params:{width:78,height:8,depth:1}},{type:"wall_indoor",position:[0,4,-38.5],params:{width:78,height:8,depth:1}},{type:"wall_indoor",position:[38.5,4,0],rotation:[0,90,0],params:{width:78,height:8,depth:1}},{type:"wall_indoor",position:[-38.5,4,0],rotation:[0,90,0],params:{width:78,height:8,depth:1}},{type:"ceiling_slab",position:[0,7.8,0],params:{width:78,depth:78}},{type:"ceiling_panel",position:[-20,7.6,-25],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[0,7.6,-25],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[20,7.6,-25],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[-20,7.6,-8],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[0,7.6,-8],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[20,7.6,-8],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[-20,7.6,10],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[0,7.6,10],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[20,7.6,10],params:{width:6,depth:.8}},{type:"ceiling_panel",position:[0,7.6,28],params:{width:6,depth:.8}},{type:"cubicle",position:[-28,0,-28],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[-28,0,-18],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[-28,0,-8],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[-28,0,2],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[-22,0,-28],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[-22,0,-18],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[-22,0,-8],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[-22,0,2],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[22,0,-28],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[22,0,-18],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[22,0,-8],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[22,0,2],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[28,0,-28],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[28,0,-18],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[28,0,-8],params:{width:5,depth:5,height:2.2}},{type:"cubicle",position:[28,0,2],params:{width:5,depth:5,height:2.2}},{type:"filing_cabinet",position:[-35,0,-30]},{type:"filing_cabinet",position:[-35,0,-22]},{type:"filing_cabinet",position:[-35,0,-14]},{type:"filing_cabinet",position:[35,0,-30]},{type:"filing_cabinet",position:[35,0,-22]},{type:"filing_cabinet",position:[35,0,-14]},{type:"printer",position:[-18,0,-32]},{type:"printer",position:[18,0,-32]},{type:"printer",position:[-18,0,10]},{type:"printer",position:[18,0,10]},{type:"water_cooler",position:[-8,0,-22]},{type:"water_cooler",position:[8,0,-22]},{type:"water_cooler",position:[0,0,-5]},{type:"trash_can",position:[-12,0,-30]},{type:"trash_can",position:[12,0,-30]},{type:"trash_can",position:[-5,0,8]},{type:"trash_can",position:[5,0,8]},{type:"planter",position:[-36,0,5]},{type:"planter",position:[36,0,5]},{type:"planter",position:[0,0,35]},{type:"ramp",position:[-18,0,-30],rotation:[0,-90,0]},{type:"rail",position:[0,0,-18],params:{length:12}},{type:"rail",position:[0,0,-5],params:{length:16}},{type:"rail",position:[-10,0,5],params:{length:8},rotation:[0,90,0]},{type:"rail",position:[10,0,5],params:{length:8},rotation:[0,90,0]},{type:"fun_box",position:[0,0,-32],params:{width:8,depth:4,height:.9}},{type:"fun_box",position:[-8,0,15],params:{width:5,depth:3,height:.8}},{type:"fun_box",position:[8,0,15],params:{width:5,depth:3,height:.8}},{type:"ramp",position:[-5,0,-12],rotation:[0,0,0]},{type:"ramp",position:[5,0,-12],rotation:[0,180,0]},{type:"ramp",position:[0,0,18],rotation:[0,0,0]},{type:"exit_sign",position:[0,3.5,37],params:{width:3,height:.8}},{type:"stairs",position:[0,0,32],rotation:[0,180,0],params:{steps:6}}],collectibles:[{type:"document",position:[-20,1.5,-18],value:200},{type:"document",position:[20,1.5,-18],value:200},{type:"document",position:[0,2,-5],value:500},{type:"money",position:[-8,1.2,-30],value:1e3},{type:"money",position:[8,1.2,-30],value:1e3},{type:"special",position:[0,2.5,-32],value:2500}],goals:[{type:"escape",target:1,description:"Reach the stairwell!",reward:2e3},{type:"score",target:5e3,description:"Score 5,000 stonks",reward:1e3},{type:"grind",target:3,description:"Grind 3 desk rails",reward:750},{type:"collect",target:3,description:"Grab the shredded documents",reward:1500}],timeLimit:120,introDialogue:["📰 BREAKING NEWS: SEC RAIDS STONKS CAPITAL!","SEC AGENT: Freeze! Tony Stonks, you're under arrest for market manipulation!","TONY: Not today! *jumps on office chair* YOLO! 🚀","🎯 OBJECTIVE: Escape the office!"],outroDialogue:["TONY: Made it to the stairs! But I can hear them behind me...","SEC AGENT: He's heading down! All units to the stairwell!"]},ga={id:"story_2_stairwell",chapter:1,storyOrder:2,nextLevel:"story_3_lobby",name:"Stairwell Descent",subtitle:"50 Floors of Freedom",description:"Grind your way down 50 floors of stair rails!",skyColor:"#333340",skyColorTop:"#1a1a25",skyColorBottom:"#404050",fogColor:"#2a2a35",fogNear:10,fogFar:50,ambientLight:.4,sunIntensity:.2,groundSize:40,groundColor:"#444455",spawnPoint:{position:[0,50,-15],rotation:0},bounds:{minX:-18,maxX:18,minZ:-18,maxZ:18},checkpoints:[],objects:[{type:"rail",position:[0,50,-10],params:{length:8},rotation:[0,0,0]},{type:"stairs",position:[0,50,0],rotation:[0,0,0],params:{steps:10}},{type:"rail",position:[8,40,0],params:{length:8},rotation:[0,90,0]},{type:"stairs",position:[5,40,5],rotation:[0,90,0],params:{steps:10}},{type:"rail",position:[0,30,10],params:{length:8},rotation:[0,180,0]},{type:"stairs",position:[0,30,5],rotation:[0,180,0],params:{steps:10}},{type:"rail",position:[-8,20,0],params:{length:8},rotation:[0,-90,0]},{type:"stairs",position:[-5,20,-5],rotation:[0,-90,0],params:{steps:10}},{type:"rail",position:[0,10,-10],params:{length:8},rotation:[0,0,0]},{type:"ramp",position:[5,10,-5],rotation:[0,45,0]},{type:"rail",position:[5,5,0],params:{length:6},rotation:[0,45,0]},{type:"rail",position:[0,2,5],params:{length:6},rotation:[0,0,0]},{type:"fun_box",position:[0,0,10],params:{width:8,depth:4,height:.5}}],goals:[{type:"escape",target:1,description:"Reach the lobby!",reward:2500},{type:"score",target:1e4,description:"Score 10,000 stonks",reward:1500},{type:"grind",target:5,description:"Grind 5 stair rails",reward:1e3},{type:"time",target:60,description:"Finish in under 60 seconds",reward:2e3}],timeLimit:90,introDialogue:["TONY: 50 floors down... piece of cake!","TONY: These chair wheels were made for grinding!"]},ya={id:"story_3_lobby",chapter:1,storyOrder:3,nextLevel:"story_4_highway",name:"Lobby Showdown",subtitle:"The Great Escape",description:"The grand lobby is crawling with security. Crash through the glass doors to freedom!",skyColor:"#87ceeb",skyColorTop:"#5a9fd4",skyColorBottom:"#b8d4e8",fogColor:"#c0c0c0",fogNear:30,fogFar:100,ambientLight:.7,sunIntensity:1,groundSize:100,groundColor:"#d4c4a8",spawnPoint:{position:[0,.5,-40],rotation:0},bounds:{minX:-45,maxX:45,minZ:-45,maxZ:45},checkpoints:[{position:[0,.5,35],rotation:0,name:"Escaped the building!",dialogue:["TONY: FREEDOM! But I'm not out of the woods yet...","SEC AGENT: *into radio* Subject is heading to the highway!"]}],objects:[{type:"rail",position:[0,0,-25],params:{length:25}},{type:"fun_box",position:[0,0,-25],params:{width:25,depth:3,height:1.2}},{type:"planter",position:[-20,0,-20]},{type:"planter",position:[20,0,-20]},{type:"planter",position:[-20,0,0]},{type:"planter",position:[20,0,0]},{type:"planter",position:[-20,0,20]},{type:"planter",position:[20,0,20]},{type:"bench",position:[-10,0,-10]},{type:"bench",position:[10,0,-10]},{type:"bench",position:[-10,0,10]},{type:"bench",position:[10,0,10]},{type:"planter",position:[-30,0,-15]},{type:"planter",position:[30,0,-15]},{type:"planter",position:[-30,0,15]},{type:"planter",position:[30,0,15]},{type:"fun_box",position:[0,0,0],params:{width:10,depth:10,height:1}},{type:"rail",position:[-5,0,0],params:{length:10},rotation:[0,90,0]},{type:"rail",position:[5,0,0],params:{length:10},rotation:[0,90,0]},{type:"ramp",position:[-8,0,25],rotation:[0,0,0]},{type:"ramp",position:[8,0,25],rotation:[0,0,0]},{type:"quarter_pipe_small",position:[-40,0,0],rotation:[0,90,0]},{type:"quarter_pipe_small",position:[40,0,0],rotation:[0,-90,0]},{type:"barrier",position:[-15,0,40],params:{length:10}},{type:"barrier",position:[15,0,40],params:{length:10}}],collectibles:[{type:"money",position:[0,2,-25],value:2e3},{type:"money",position:[-20,1.5,0],value:1e3},{type:"money",position:[20,1.5,0],value:1e3},{type:"special",position:[0,3,0],value:5e3}],goals:[{type:"escape",target:1,description:"Crash through the front doors!",reward:3e3},{type:"score",target:15e3,description:"Score 15,000 stonks",reward:2e3},{type:"combo",target:5e3,description:"Land a 5,000 point combo",reward:1500},{type:"grind",target:5,description:"Grind the reception desk",reward:1e3}],timeLimit:150,introDialogue:["TONY: The lobby! Almost there!","SECURITY: Stop that man! He's on a... chair?!","TONY: Try and catch me!"]},ba={id:"story_4_highway",chapter:2,storyOrder:4,nextLevel:"story_5_home",name:"Highway Havoc",subtitle:"Rush Hour Rumble",description:"Weave through traffic on your office chair! Don't get flattened!",skyColor:"#87ceeb",skyColorTop:"#4a90d9",skyColorBottom:"#c8e0f4",fogColor:"#888888",fogNear:50,fogFar:200,ambientLight:.8,sunIntensity:1.2,groundSize:200,groundColor:"#333333",spawnPoint:{position:[-80,.5,0],rotation:90},bounds:{minX:-95,maxX:95,minZ:-30,maxZ:30},checkpoints:[{position:[0,.5,0],rotation:90,name:"Halfway across!",dialogue:["TONY: Construction site ahead - shortcut!"]},{position:[80,.5,0],rotation:90,name:"Made it to the suburbs!",dialogue:["TONY: Home is just around the corner..."]}],objects:[{type:"rail",position:[0,0,-25],params:{length:180}},{type:"rail",position:[0,0,25],params:{length:180}},{type:"barrier",position:[0,0,-25],params:{length:180}},{type:"barrier",position:[0,0,25],params:{length:180}},{type:"rail",position:[0,0,0],params:{length:60}},{type:"barrier",position:[-50,0,0],params:{length:30}},{type:"barrier",position:[50,0,0],params:{length:30}},{type:"car",position:[-60,0,-15],rotation:[0,90,0]},{type:"car",position:[-40,0,-8],rotation:[0,90,0]},{type:"car",position:[-20,0,-18],rotation:[0,90,0]},{type:"car",position:[0,0,-12],rotation:[0,90,0]},{type:"car",position:[20,0,-5],rotation:[0,90,0]},{type:"car",position:[40,0,-15],rotation:[0,90,0]},{type:"car",position:[60,0,-10],rotation:[0,90,0]},{type:"car",position:[-50,0,12],rotation:[0,-90,0]},{type:"car",position:[-30,0,18],rotation:[0,-90,0]},{type:"car",position:[-10,0,8],rotation:[0,-90,0]},{type:"car",position:[10,0,15],rotation:[0,-90,0]},{type:"car",position:[30,0,10],rotation:[0,-90,0]},{type:"car",position:[50,0,18],rotation:[0,-90,0]},{type:"cone",position:[-5,0,-5]},{type:"cone",position:[0,0,-5]},{type:"cone",position:[5,0,-5]},{type:"cone",position:[-5,0,5]},{type:"cone",position:[0,0,5]},{type:"cone",position:[5,0,5]},{type:"ramp",position:[-10,0,0],rotation:[0,90,0]},{type:"ramp",position:[10,0,0],rotation:[0,-90,0]},{type:"quarter_pipe_small",position:[0,0,-8],rotation:[0,0,0]},{type:"ramp",position:[85,0,0],rotation:[0,90,0]}],goals:[{type:"escape",target:1,description:"Make it to the suburbs!",reward:3500},{type:"score",target:2e4,description:"Score 20,000 stonks",reward:2500},{type:"grind",target:10,description:"Grind the highway barriers",reward:2e3},{type:"time",target:90,description:"Finish in under 90 seconds",reward:3e3}],timeLimit:180,introDialogue:["TONY: The highway! This chair was built for speed!","📻 RADIO: Traffic backed up due to a... chair chase?!","TONY: Just need to get to my house and grab my go-bag!"]},wa={id:"story_5_home",chapter:2,storyOrder:5,nextLevel:"story_6_forest",name:"Home Sweet Home... Not",subtitle:"Nowhere to Run",description:"Your house is surrounded by FBI! Grab what you can and escape through the back!",skyColor:"#ff9966",skyColorTop:"#ff6b35",skyColorBottom:"#ffb347",fogColor:"#ffaa77",fogNear:40,fogFar:120,ambientLight:.6,sunIntensity:.9,groundSize:80,groundColor:"#4a7c29",spawnPoint:{position:[-30,.5,0],rotation:90},bounds:{minX:-38,maxX:38,minZ:-38,maxZ:38},checkpoints:[{position:[0,.5,30],rotation:0,name:"Into the forest!",dialogue:["TONY: The forest behind the house - they'll never catch me in there!"]}],objects:[{type:"building_wide",position:[0,0,-15],params:{width:20,depth:15,height:8}},{type:"car",position:[-15,0,5],rotation:[0,30,0]},{type:"car",position:[15,0,5],rotation:[0,-30,0]},{type:"car",position:[0,0,10],rotation:[0,0,0]},{type:"barrier",position:[-10,0,15],params:{length:8}},{type:"barrier",position:[10,0,15],params:{length:8}},{type:"shrub_medium",position:[-25,0,10]},{type:"shrub_medium",position:[-25,0,20]},{type:"shrub_medium",position:[25,0,10]},{type:"shrub_medium",position:[25,0,20]},{type:"rail",position:[-30,0,15],params:{length:25},rotation:[0,90,0]},{type:"rail",position:[30,0,15],params:{length:25},rotation:[0,90,0]},{type:"ramp",position:[-15,0,25],rotation:[0,0,0]},{type:"ramp",position:[15,0,25],rotation:[0,0,0]},{type:"tree_small",position:[-20,0,35]},{type:"tree_small",position:[-10,0,33]},{type:"tree_small",position:[10,0,35]},{type:"tree_small",position:[20,0,33]}],collectibles:[{type:"money",position:[-20,1,20],value:1500},{type:"money",position:[20,1,20],value:1500},{type:"special",position:[0,2,25],value:3e3}],goals:[{type:"escape",target:1,description:"Escape into the forest!",reward:2500},{type:"score",target:1e4,description:"Score 10,000 stonks",reward:1500},{type:"time",target:45,description:"Get out in under 45 seconds",reward:2e3}],timeLimit:90,introDialogue:["TONY: Home sweet-- wait, is that the FBI?!","FBI AGENT: Tony Stonks! Come out with your hands up!","TONY: That's not happening! Time for plan B...","TONY: Through the backyard and into the forest!"]},xa={id:"story_6_forest",chapter:2,storyOrder:6,nextLevel:"story_7_trainyard",name:"Forest Chase",subtitle:"Lost in the Woods",description:"Agents are right behind you! Use tricks for speed boosts to outrun them!",hasChaseMechanic:!0,chaseSpeed:8,skyColor:"#2d4a2d",skyColorTop:"#1a3a1a",skyColorBottom:"#4a6a4a",fogColor:"#3a5a3a",fogNear:15,fogFar:60,ambientLight:.4,sunIntensity:.5,groundSize:150,groundColor:"#3a5a3a",spawnPoint:{position:[-60,.5,0],rotation:90},bounds:{minX:-70,maxX:70,minZ:-40,maxZ:40},checkpoints:[{position:[0,.5,0],rotation:90,name:"Halfway through!",dialogue:["TONY: I can hear them falling behind!"]},{position:[60,.5,0],rotation:90,name:"Lost them in the woods!",dialogue:["TONY: *panting* I think... I lost them!","TONY: Wait, is that a train yard up ahead?"]}],objects:[{type:"tree_small",position:[-50,0,-20]},{type:"tree_small",position:[-45,0,15]},{type:"tree_small",position:[-40,0,-10]},{type:"tree_small",position:[-35,0,25]},{type:"tree_small",position:[-30,0,-25]},{type:"tree_small",position:[-25,0,5]},{type:"tree_small",position:[-20,0,-15]},{type:"tree_small",position:[-15,0,20]},{type:"tree_small",position:[-10,0,-5]},{type:"tree_small",position:[-5,0,30]},{type:"tree_small",position:[0,0,-30]},{type:"tree_small",position:[5,0,10]},{type:"tree_small",position:[10,0,-20]},{type:"tree_small",position:[15,0,25]},{type:"tree_small",position:[20,0,-10]},{type:"tree_small",position:[25,0,15]},{type:"tree_small",position:[30,0,-25]},{type:"tree_small",position:[35,0,5]},{type:"tree_small",position:[40,0,-15]},{type:"tree_small",position:[45,0,20]},{type:"tree_small",position:[50,0,-5]},{type:"rail",position:[-45,0,0],params:{length:12},rotation:[0,20,0]},{type:"rail",position:[-20,0,10],params:{length:15},rotation:[0,-15,0]},{type:"rail",position:[5,0,-8],params:{length:10},rotation:[0,30,0]},{type:"rail",position:[30,0,12],params:{length:14},rotation:[0,-25,0]},{type:"rail",position:[55,0,-3],params:{length:12},rotation:[0,10,0]},{type:"ramp",position:[-40,0,-12],rotation:[0,45,0]},{type:"ramp",position:[-15,0,-20],rotation:[0,-30,0]},{type:"ramp",position:[10,0,18],rotation:[0,60,0]},{type:"ramp",position:[35,0,-18],rotation:[0,-45,0]},{type:"quarter_pipe_small",position:[20,0,0],rotation:[0,90,0]},{type:"shrub_small",position:[-55,0,-8]},{type:"shrub_small",position:[-38,0,22]},{type:"shrub_small",position:[-12,0,-28]},{type:"shrub_small",position:[8,0,28]},{type:"shrub_small",position:[28,0,-28]},{type:"shrub_small",position:[48,0,15]},{type:"shrub_medium",position:[-28,0,-18]},{type:"shrub_medium",position:[18,0,22]},{type:"shrub_medium",position:[42,0,-22]}],goals:[{type:"escape",target:1,description:"Escape through the forest!",reward:4e3},{type:"score",target:25e3,description:"Score 25,000 stonks",reward:3e3},{type:"grind",target:5,description:"Grind 5 fallen logs",reward:2e3},{type:"combo",target:8e3,description:"Land an 8,000 point combo",reward:2500}],timeLimit:120,introDialogue:["TONY: Into the forest! These wheels can handle anything!","FBI AGENT: Don't let him escape! After him!","TONY: Tricks give me speed boosts - time to show off!"]},va={id:"story_7_trainyard",chapter:3,storyOrder:7,nextLevel:"story_8_rooftops",name:"Train Yard Takeoff",subtitle:"End of the Line",description:"Navigate the abandoned train yard. Grind the rails to catch a departing freight train!",skyColor:"#2c3e50",skyColorTop:"#1a252f",skyColorBottom:"#34495e",fogColor:"#3d566e",fogNear:30,fogFar:100,ambientLight:.35,sunIntensity:.4,groundSize:200,groundColor:"#3a3a3a",spawnPoint:{position:[-80,.5,0],rotation:90},bounds:{minX:-95,maxX:95,minZ:-50,maxZ:50},checkpoints:[{position:[0,.5,0],rotation:90,name:"Past the yard office",dialogue:["TONY: There's a freight train starting to move!"]},{position:[80,3,0],rotation:90,name:"Caught the train!",dialogue:["TONY: Made it! This train will take me far away...","TONY: Wait, where is this thing going?"]}],objects:[{type:"rail",position:[0,0,-30],params:{length:180}},{type:"rail",position:[0,0,-20],params:{length:180}},{type:"rail",position:[0,0,0],params:{length:180}},{type:"rail",position:[0,0,20],params:{length:180}},{type:"rail",position:[0,0,30],params:{length:180}},{type:"fun_box",position:[-60,0,-25],params:{width:20,depth:4,height:3}},{type:"fun_box",position:[-35,0,-25],params:{width:15,depth:4,height:3}},{type:"fun_box",position:[10,0,25],params:{width:25,depth:4,height:3}},{type:"fun_box",position:[45,0,25],params:{width:20,depth:4,height:3}},{type:"building_small",position:[-20,0,40],params:{width:10,depth:8,height:6}},{type:"ramp",position:[-70,0,10],rotation:[0,90,0]},{type:"ramp",position:[-50,0,-10],rotation:[0,-90,0]},{type:"ramp",position:[20,0,-15],rotation:[0,45,0]},{type:"ramp",position:[50,0,10],rotation:[0,-45,0]},{type:"quarter_pipe_small",position:[-30,0,0],rotation:[0,90,0]},{type:"quarter_pipe_small",position:[30,0,0],rotation:[0,-90,0]},{type:"trash_can",position:[-55,0,35]},{type:"trash_can",position:[-45,0,35]},{type:"trash_can",position:[25,0,-40]},{type:"trash_can",position:[35,0,-40]},{type:"fun_box",position:[80,0,0],params:{width:15,depth:8,height:4}},{type:"ramp",position:[70,0,0],rotation:[0,90,0]}],collectibles:[{type:"money",position:[-50,4,-25],value:2e3},{type:"money",position:[20,4,25],value:2e3},{type:"special",position:[0,2,0],value:5e3}],goals:[{type:"escape",target:1,description:"Catch the freight train!",reward:5e3},{type:"score",target:3e4,description:"Score 30,000 stonks",reward:4e3},{type:"grind",target:15,description:"Grind 15 railroad tracks",reward:3e3},{type:"combo",target:12e3,description:"Land a 12,000 point combo",reward:3500}],timeLimit:180,introDialogue:["TONY: An old train yard! Perfect place to lose them.","TONY: Wait... is that freight train starting to move?","TONY: If I can catch it, I'm home free!"]},Sa={id:"story_8_rooftops",chapter:3,storyOrder:8,nextLevel:"story_9_finale",name:"Rooftop Run",subtitle:"Sky High Stakes",description:"The train dropped you in the city. Escape across the rooftops to the helipad!",skyColor:"#1a1a2e",skyColorTop:"#0a0a15",skyColorBottom:"#2a2a4e",fogColor:"#1a1a2e",fogNear:40,fogFar:150,ambientLight:.3,sunIntensity:.2,groundSize:200,groundColor:"#333333",spawnPoint:{position:[-80,20,0],rotation:90},bounds:{minX:-95,maxX:95,minZ:-50,maxZ:50},checkpoints:[{position:[0,25,0],rotation:90,name:"Halfway across!",dialogue:["TONY: I can see the helipad! Just a few more jumps!"]},{position:[80,30,0],rotation:90,name:"Reached the helipad!",dialogue:["TONY: The helicopter is waiting! Time for the finale!","PILOT: Mr. Stonks! We've got one last obstacle..."]}],objects:[{type:"fun_box",position:[-75,18,0],params:{width:20,depth:30,height:2}},{type:"fun_box",position:[-50,20,-20],params:{width:15,depth:20,height:2}},{type:"fun_box",position:[-50,22,20],params:{width:18,depth:15,height:2}},{type:"fun_box",position:[-25,23,0],params:{width:25,depth:25,height:2}},{type:"fun_box",position:[0,25,-15],params:{width:20,depth:20,height:2}},{type:"fun_box",position:[0,24,20],params:{width:15,depth:15,height:2}},{type:"fun_box",position:[30,26,0],params:{width:30,depth:30,height:2}},{type:"fun_box",position:[60,28,-10],params:{width:20,depth:25,height:2}},{type:"fun_box",position:[80,30,0],params:{width:25,depth:25,height:2}},{type:"rail",position:[-65,20,-12],params:{length:15}},{type:"rail",position:[-50,22,-8],params:{length:12},rotation:[0,90,0]},{type:"rail",position:[-25,25,10],params:{length:18}},{type:"rail",position:[0,27,5],params:{length:15},rotation:[0,45,0]},{type:"rail",position:[30,28,-12],params:{length:20}},{type:"rail",position:[55,30,0],params:{length:15},rotation:[0,90,0]},{type:"ramp",position:[-60,18,0],rotation:[0,90,0]},{type:"ramp",position:[-38,20,-15],rotation:[0,45,0]},{type:"ramp",position:[-38,22,15],rotation:[0,-30,0]},{type:"ramp",position:[-12,23,0],rotation:[0,90,0]},{type:"ramp",position:[12,25,10],rotation:[0,60,0]},{type:"ramp",position:[45,26,-5],rotation:[0,90,0]},{type:"ramp",position:[70,28,5],rotation:[0,75,0]},{type:"fun_box",position:[-70,20,10],params:{width:3,depth:3,height:1.5}},{type:"fun_box",position:[-20,25,-8],params:{width:4,depth:4,height:2}},{type:"fun_box",position:[35,28,10],params:{width:3,depth:3,height:1.5}},{type:"quarter_pipe_small",position:[-30,23,-10],rotation:[0,0,0]},{type:"quarter_pipe_small",position:[20,26,0],rotation:[0,90,0]}],collectibles:[{type:"money",position:[-50,24,0],value:3e3},{type:"money",position:[0,28,0],value:3e3},{type:"money",position:[50,32,0],value:3e3},{type:"special",position:[30,30,0],value:7500}],goals:[{type:"escape",target:1,description:"Reach the helipad!",reward:6e3},{type:"score",target:4e4,description:"Score 40,000 stonks",reward:5e3},{type:"grind",target:10,description:"Grind 10 rooftop rails",reward:3500},{type:"combo",target:15e3,description:"Land a 15,000 point combo",reward:4e3}],timeLimit:200,introDialogue:["TONY: The city skyline! The helicopter is on that far building!","TONY: Time for some rooftop acrobatics!","🚁 PILOT: *radio* Mr. Stonks, hurry! They're closing in!"]},Ta={id:"story_9_finale",chapter:3,storyOrder:9,name:"The Great Escape",subtitle:"Freedom at Last",description:"One final gauntlet! Make it to the helicopter before the SEC catches up!",hasChaseMechanic:!0,chaseSpeed:12,skyColor:"#ff6b35",skyColorTop:"#ff4500",skyColorBottom:"#ffa500",fogColor:"#ff8c42",fogNear:40,fogFar:120,ambientLight:.6,sunIntensity:1,groundSize:150,groundColor:"#444444",spawnPoint:{position:[-60,.5,0],rotation:90},bounds:{minX:-70,maxX:70,minZ:-40,maxZ:40},checkpoints:[{position:[60,5,0],rotation:90,name:"FREEDOM!",dialogue:["🎉 TONY: I DID IT! STONKS TO THE MOON!","SEC AGENT: He got away... again.","🚁 PILOT: Where to, Mr. Stonks?","TONY: Somewhere with no extradition treaty... and beaches!","📰 EPILOGUE: Tony Stonks was never seen again...","📈 ...but his legendary escape became a viral video,","💰 ...and STONKS coin went up 10,000%.","🏝️ THE END... ?"]}],objects:[{type:"car",position:[-45,0,-15],rotation:[0,30,0]},{type:"car",position:[-45,0,15],rotation:[0,-30,0]},{type:"car",position:[-30,0,0],rotation:[0,0,0]},{type:"rail",position:[-20,0,-20],params:{length:25}},{type:"rail",position:[-20,0,20],params:{length:25}},{type:"rail",position:[-20,0,0],params:{length:30}},{type:"ramp",position:[0,0,-15],rotation:[0,45,0]},{type:"ramp",position:[0,0,15],rotation:[0,-45,0]},{type:"quarter_pipe_med",position:[0,0,0],rotation:[0,90,0]},{type:"barrier",position:[15,0,-10],params:{length:8}},{type:"barrier",position:[15,0,10],params:{length:8}},{type:"cone",position:[20,0,-5]},{type:"cone",position:[20,0,0]},{type:"cone",position:[20,0,5]},{type:"trash_can",position:[25,0,-15]},{type:"trash_can",position:[25,0,15]},{type:"fun_box",position:[40,0,0],params:{width:15,depth:20,height:2}},{type:"rail",position:[40,2,-8],params:{length:15}},{type:"rail",position:[40,2,8],params:{length:15}},{type:"ramp",position:[50,2,0],rotation:[0,90,0]},{type:"fun_box",position:[60,4,0],params:{width:15,depth:15,height:1}}],collectibles:[{type:"money",position:[-30,1,-15],value:2500},{type:"money",position:[-30,1,15],value:2500},{type:"money",position:[0,3,0],value:5e3},{type:"money",position:[40,5,0],value:5e3},{type:"special",position:[60,7,0],value:1e4}],goals:[{type:"escape",target:1,description:"REACH THE HELICOPTER!",reward:1e4},{type:"score",target:5e4,description:"Score 50,000 stonks (finale bonus!)",reward:7500},{type:"combo",target:2e4,description:"Land a LEGENDARY 20K combo!",reward:5e3},{type:"time",target:60,description:"Escape in under 60 seconds!",reward:8e3}],timeLimit:120,introDialogue:["🚁 PILOT: Mr. Stonks! They're right behind you!","SEC AGENT: This is your last chance, Stonks! Give up!","TONY: NEVER! DIAMOND HANDS FOREVER! 💎🙌","TONY: ONE LAST RIDE!"]},Yi=[fa,ga,ya,ba,wa,xa,va,Sa,Ta];function ka(p){return Yi.find(e=>e.id===p)}class Ca{isActive=!1;chaseDistance=50;agentSpeed=8;playerSpeedBoost=0;speedBoostDecay=2;callbacks;lastWarningLevel="safe";agentGroup=null;constructor(e={}){this.callbacks=e}start(e=8,t=50){this.isActive=!0,this.agentSpeed=e,this.chaseDistance=t,this.playerSpeedBoost=0,this.lastWarningLevel="safe"}stop(){this.isActive=!1,this.playerSpeedBoost=0}addSpeedBoost(e){this.playerSpeedBoost=Math.min(20,this.playerSpeedBoost+e),this.callbacks.onSpeedBoost?.(this.playerSpeedBoost)}update(e,t,i){if(!this.isActive)return;this.playerSpeedBoost=Math.max(0,this.playerSpeedBoost-this.speedBoostDecay*e);const s=t+this.playerSpeedBoost,n=this.agentSpeed,o=s-n;if(this.chaseDistance=Math.max(0,Math.min(100,this.chaseDistance+o*e*2)),this.chaseDistance<=0){this.callbacks.onCaught?.(),this.isActive=!1;return}const a=this.getWarningLevel();a!==this.lastWarningLevel&&(this.lastWarningLevel=a,this.callbacks.onWarningChange?.(a))}getWarningLevel(){return this.chaseDistance>70?"safe":this.chaseDistance>40?"warning":this.chaseDistance>20?"danger":"critical"}getState(){return{isActive:this.isActive,chaseDistance:this.chaseDistance,agentSpeed:this.agentSpeed,playerSpeedBoost:this.playerSpeedBoost,warningLevel:this.lastWarningLevel}}isChaseActive(){return this.isActive}getDistance(){return this.chaseDistance}createVisuals(e){this.agentGroup=new A;const t=new T({color:1710618,emissive:2228224,emissiveIntensity:.3});for(let s=0;s<3;s++){const n=new A,o=new Ot(.3,1.2,4,8),a=new f(o,t);a.position.y=1,n.add(a);const r=new pe(.25,8,8),l=new f(r,t);l.position.y=1.9,n.add(l);const d=(s-1)*.5;n.position.set(d*2,0,s===1?-2:0),this.agentGroup.add(n)}const i=new ji(16711680,1,20,Math.PI/4,.5);return i.position.set(0,2,-3),i.target.position.set(0,0,5),this.agentGroup.add(i),this.agentGroup.add(i.target),e.add(this.agentGroup),this.agentGroup}updateVisuals(e,t){if(!this.agentGroup)return;const i=5+(100-this.chaseDistance)*.3,s=e.x-Math.sin(t)*i,n=e.z-Math.cos(t)*i;this.agentGroup.position.set(s,e.y,n),this.agentGroup.rotation.y=t;const o=Date.now()*.003;this.agentGroup.children.forEach((a,r)=>{a instanceof A&&(a.position.y=Math.sin(o+r*.5)*.1)})}removeVisuals(e){this.agentGroup&&(e.remove(this.agentGroup),this.agentGroup=null)}}function yt(){try{const p=localStorage.getItem("tony-stonks-settings");if(p)return{...fs(),...JSON.parse(p)}}catch(p){console.warn("Failed to load settings:",p)}return fs()}function vi(p){try{localStorage.setItem("tony-stonks-settings",JSON.stringify(p))}catch(e){console.warn("Failed to save settings:",e)}}function fs(){return{playerSkin:"tony_stonks",musicVolume:.7,sfxVolume:1}}const rn="tony-stonks-highscores";function Ki(){try{const p=localStorage.getItem(rn);if(p)return JSON.parse(p)}catch(p){console.warn("Failed to load high scores:",p)}return{}}function Ea(p){try{localStorage.setItem(rn,JSON.stringify(p))}catch(e){console.warn("Failed to save high scores:",e)}}function Ma(p){return Ki()[p]||null}function Aa(p,e,t){const i=Ki(),s=i[p];return!s||e>s.score?(i[p]={score:e,rank:t,date:new Date().toISOString()},Ea(i),!0):!1}class La{scene;camera;renderer;model=null;mixer=null;animationId=null;fbxLoader;constructor(e){this.scene=new Vi,this.scene.background=new B(1710638),this.camera=new qt(45,1,.1,100),this.camera.position.set(0,1,3),this.camera.lookAt(0,.8,0),this.renderer=new $i({antialias:!0}),this.renderer.setSize(200,250),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)),e.appendChild(this.renderer.domElement);const t=new li(16777215,.6);this.scene.add(t);const i=new xt(16777215,.8);i.position.set(2,3,2),this.scene.add(i);const s=new _n(1,32),n=new T({color:3355460}),o=new f(s,n);o.rotation.x=-Math.PI/2,o.position.y=0,this.scene.add(o),this.fbxLoader=new tn,this.animate()}async loadSkin(e){this.model&&(this.scene.remove(this.model),this.model=null,this.mixer=null);const t=e==="stonks_guy"?"./models/player-stonks.fbx":"./models/player-combined.fbx";let i=.006;try{this.model=await this.fbxLoader.loadAsync(t),console.log(`Preview loaded FBX: ${t}`)}catch{console.warn(`Preview FBX not found: ${t}, trying fallback...`);try{this.model=await this.fbxLoader.loadAsync("./models/player-combined.fbx"),console.log("Preview loaded default FBX")}catch{try{const{GLTFLoader:o}=await da(async()=>{const{GLTFLoader:l}=await Promise.resolve().then(()=>vo);return{GLTFLoader:l}},void 0,import.meta.url),r=await new o().loadAsync("./models/player.glb");this.model=r.scene,i=.6,console.log("Preview loaded GLB fallback")}catch(o){console.error("Preview: Failed to load any model",o);return}}}if(this.model&&(this.model.scale.set(i,i,i),this.model.position.set(0,0,0),this.model.rotation.y=Math.PI,this.scene.add(this.model),this.model.animations&&this.model.animations.length>0)){this.mixer=new Xi(this.model);const s=e==="stonks_guy"?["idle_11","idle 11","standing","idle"]:["idle_11","idle 11","standing","victory"];let n=null;for(const o of s)if(n=this.model.animations.find(a=>a.name.toLowerCase().includes(o)),n)break;n||(n=this.model.animations[0]),n&&(console.log(`Preview playing: ${n.name}`),this.mixer.clipAction(n).play())}}animate=()=>{this.animationId=requestAnimationFrame(this.animate),this.model&&(this.model.rotation.y+=.01),this.mixer&&this.mixer.update(.016),this.renderer.render(this.scene,this.camera)};dispose(){this.animationId&&cancelAnimationFrame(this.animationId),this.renderer.dispose()}}class Pa{state="loading";callbacks;uiContainer;currentLevelId="";lastResult=null;titleGlitchTimeout=null;playerPreview=null;isPlayTesting=!1;backgroundContainer=null;contentContainer=null;constructor(e,t={}){this.uiContainer=e,this.callbacks=t,this.initKeyboardControls(),this.initContainers()}initContainers(){this.backgroundContainer=document.createElement("div"),this.backgroundContainer.id="persistent-bg",this.backgroundContainer.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: url('./ui/titlebg.png') center center / cover no-repeat;
      background-color: #1a1a2e;
      z-index: 0;
      pointer-events: none;
      display: none;
    `,this.uiContainer.appendChild(this.backgroundContainer),this.contentContainer=document.createElement("div"),this.contentContainer.id="ui-content",this.contentContainer.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      pointer-events: none;
    `,this.uiContainer.appendChild(this.contentContainer)}initKeyboardControls(){window.addEventListener("keydown",e=>{switch(this.state){case"title":(e.code==="Space"||e.code==="Enter")&&this.setState("menu");break;case"playing":e.code==="Escape"&&(this.setState("paused"),this.callbacks.onPause?.());break;case"paused":e.code==="Escape"&&(this.setState("playing"),this.callbacks.onResume?.());break}})}setState(e){const t=this.state;this.state=e,this.callbacks.onStateChange?.(t,e),this.renderUI()}getState(){return this.state}setPlayTesting(e){this.isPlayTesting=e}startLevel(e){this.currentLevelId=e,this.setState("playing"),this.callbacks.onStartGame?.(e)}endLevel(e,t,i,s){const n=i/s;let o;n>=1&&e>=5e4?o="S":n>=.75?o="A":n>=.5?o="B":n>=.25?o="C":o="D";const a=Ma(this.currentLevelId),r=Aa(this.currentLevelId,e,o);this.lastResult={levelId:this.currentLevelId,score:e,time:t,goalsCompleted:i,totalGoals:s,rank:o,isNewHighScore:r,previousHighScore:a?.score??null},this.setState("results")}renderUI(){this.contentContainer&&(this.contentContainer.innerHTML="");const t=["title","menu","level_select","story_select","options"].includes(this.state);switch(this.backgroundContainer&&(this.backgroundContainer.style.display=t?"block":"none"),this.contentContainer&&(this.contentContainer.style.display=this.state==="editor"?"none":"block"),this.state){case"loading":this.renderLoading();break;case"title":this.renderTitle();break;case"menu":this.renderMenu();break;case"level_select":this.renderLevelSelect();break;case"story_select":this.renderStorySelect();break;case"options":this.renderOptions();break;case"playing":break;case"paused":this.renderPauseMenu();break;case"results":this.renderResults();break}}renderLoading(){this.contentContainer.innerHTML=`
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #00FF88;
        font-family: 'Kanit', sans-serif;
      ">
        <div style="font-size: 24px; margin-bottom: 20px;">LOADING...</div>
        <div style="
          width: 200px;
          height: 4px;
          background: #333;
          border-radius: 2px;
        ">
          <div style="
            width: 50%;
            height: 100%;
            background: #00FF88;
            border-radius: 2px;
            animation: loading 1s infinite;
          "></div>
        </div>
      </div>
    `}renderTitle(){this.titleGlitchTimeout&&(clearTimeout(this.titleGlitchTimeout),this.titleGlitchTimeout=null),this.contentContainer.innerHTML=`
      <div id="title-screen" style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: auto;
      ">
        <!-- Background is now persistent, no need to duplicate -->
        
        <!-- Content container -->
        <div style="
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding-top: 5vh;
        ">
          <!-- Tony character image with float animation -->
          <img 
            id="tony-float"
            src="./ui/tony1.png" 
            alt="Tony"
            style="
              max-width: 80%;
              max-height: 45vh;
              object-fit: contain;
              animation: gentleFloat 6s ease-in-out infinite;
              filter: drop-shadow(0 10px 30px rgba(0,0,0,0.5));
            "
          />
          
          <!-- Logotype with glitch effect - larger and overlapping tony image -->
          <div id="logo-container" style="
            position: relative;
            margin-top: -8vh;
            z-index: 10;
          ">
            <img 
              id="logotype"
              src="./ui/logotype.png" 
              alt="Tony Stonks Pro Trader"
              style="
                max-width: 90vw;
                max-height: 30vh;
                object-fit: contain;
                filter: drop-shadow(0 4px 20px rgba(0,255,136,0.3));
              "
            />
            <!-- Glitch layers (hidden until glitch triggers) -->
            <img 
              id="logotype-glitch-r"
              src="./ui/logotype.png" 
              alt=""
              style="
                position: absolute;
                top: 0;
                left: 0;
                max-width: 90vw;
                max-height: 30vh;
                object-fit: contain;
                opacity: 0;
                pointer-events: none;
              "
            />
            <img 
              id="logotype-glitch-b"
              src="./ui/logotype.png" 
              alt=""
              style="
                position: absolute;
                top: 0;
                left: 0;
                max-width: 90vw;
                max-height: 30vh;
                object-fit: contain;
                opacity: 0;
                pointer-events: none;
              "
            />
          </div>
          
          <!-- Funny subtitle -->
          <div style="
            margin-top: 1vh;
            font-size: clamp(13px, 2.5vw, 18px);
            font-weight: 500;
            color: #FFD700;
            font-family: 'Kanit', sans-serif;
            letter-spacing: 2px;
            text-shadow: 0 2px 8px rgba(0,0,0,0.8);
            opacity: 0.95;
          ">Escape the SEC on an office chair 🪑💨</div>

          <!-- STORY MODE + FREE SKATE buttons -->
          <div style="
            margin-top: 3vh;
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            justify-content: center;
          ">
            <button id="title-story-btn" style="
              padding: 14px 32px;
              font-size: clamp(15px, 2.5vw, 20px);
              font-weight: bold;
              font-family: 'Kanit', sans-serif;
              color: #000;
              background: #00FF88;
              border: 3px solid #00cc66;
              border-radius: 8px;
              cursor: pointer;
              letter-spacing: 2px;
              box-shadow: 0 4px 16px rgba(0,255,136,0.4);
              transition: all 0.15s;
            ">📖 STORY MODE</button>
            <button id="title-freeskate-btn" style="
              padding: 14px 32px;
              font-size: clamp(15px, 2.5vw, 20px);
              font-weight: bold;
              font-family: 'Kanit', sans-serif;
              color: #fff;
              background: rgba(60,60,90,0.9);
              border: 3px solid #6666aa;
              border-radius: 8px;
              cursor: pointer;
              letter-spacing: 2px;
              transition: all 0.15s;
            ">🛹 FREE SKATE</button>
          </div>

          <!-- Press to start - smaller, below buttons -->
          <div style="
            margin-top: 2.5vh;
            font-size: clamp(12px, 2vw, 16px);
            font-weight: 500;
            color: rgba(255,255,255,0.55);
            animation: blink 1.2s infinite;
            font-family: 'Kanit', sans-serif;
            letter-spacing: 2px;
          ">— or press SPACE to start —</div>
          
          <!-- Copyright -->
          <div style="
            position: absolute;
            bottom: 20px;
            color: rgba(255,255,255,0.6);
            font-size: 12px;
            font-family: 'Kanit', sans-serif;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
          ">© 2026 Diamond Hands Studios</div>
        </div>
      </div>
      
      <style>
        @keyframes blink {
          0%, 45% { opacity: 1; }
          50%, 100% { opacity: 0.3; }
        }
        
        @keyframes gentleFloat {
          0%, 100% { 
            transform: translateY(0) rotate(0deg); 
          }
          25% { 
            transform: translateY(-8px) rotate(0.5deg); 
          }
          50% { 
            transform: translateY(-4px) rotate(-0.3deg); 
          }
          75% { 
            transform: translateY(-12px) rotate(0.3deg); 
          }
        }
        
        @keyframes glitchShake {
          0% { transform: translate(0); }
          20% { transform: translate(-3px, 2px); }
          40% { transform: translate(2px, -2px); }
          60% { transform: translate(-2px, 1px); }
          80% { transform: translate(3px, -1px); }
          100% { transform: translate(0); }
        }
      </style>
    `,this.setupLogoGlitch();const e=document.getElementById("title-story-btn"),t=document.getElementById("title-freeskate-btn");e&&(e.addEventListener("mouseenter",()=>{e.style.background="#00FF88",e.style.transform="scale(1.05)",e.style.boxShadow="0 6px 24px rgba(0,255,136,0.6)"}),e.addEventListener("mouseleave",()=>{e.style.background="#00FF88",e.style.transform="scale(1)",e.style.boxShadow="0 4px 16px rgba(0,255,136,0.4)"}),e.addEventListener("click",()=>{this.setState("story_select")})),t&&(t.addEventListener("mouseenter",()=>{t.style.background="rgba(100,100,150,0.9)",t.style.transform="scale(1.05)"}),t.addEventListener("mouseleave",()=>{t.style.background="rgba(60,60,90,0.9)",t.style.transform="scale(1)"}),t.addEventListener("click",()=>{this.setState("level_select")}))}setupLogoGlitch(){const e=()=>{const i=document.getElementById("logotype"),s=document.getElementById("logotype-glitch-r"),n=document.getElementById("logotype-glitch-b"),o=document.getElementById("logo-container");if(!i||!s||!n||!o)return;const a=Math.random()*8+4;o.style.animation="glitchShake 0.1s linear",s.style.opacity="0.8",s.style.transform=`translate(${a}px, ${-a/2}px)`,s.style.filter="hue-rotate(-60deg) saturate(2)",s.style.mixBlendMode="screen",n.style.opacity="0.8",n.style.transform=`translate(${-a}px, ${a/2}px)`,n.style.filter="hue-rotate(60deg) saturate(2)",n.style.mixBlendMode="screen",i.style.filter="drop-shadow(0 4px 20px rgba(0,255,136,0.3)) brightness(1.2) contrast(1.1)";const r=Math.random()*100+50;setTimeout(()=>{o.style.animation="",s.style.opacity="0",n.style.opacity="0",i.style.filter="drop-shadow(0 4px 20px rgba(0,255,136,0.3))"},r)},t=()=>{const i=Math.random()*3e3+2e3;this.titleGlitchTimeout=window.setTimeout(()=>{this.state==="title"&&(e(),t())},i)};t(),setTimeout(e,500)}renderMenu(){const e=[{label:"📖 STORY MODE",action:"story_select",primary:!0},{label:"🛹 FREE SKATE",action:"level_select",primary:!1},{label:"🛠️ LEVEL EDITOR",action:"editor",primary:!1},{label:"⚙️ OPTIONS",action:"options",primary:!1},{label:"📜 CREDITS",action:"credits",primary:!1}];this.contentContainer.innerHTML=`
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: rgba(0, 0, 0, 0.7);
        pointer-events: auto;
      ">
        <div id="menu-items" style="
          display: flex;
          flex-direction: column;
          gap: 15px;
        ">
          ${e.map((t,i)=>`
            <button class="menu-btn" data-action="${t.action}" style="
              width: 280px;
              padding: 15px 30px;
              font-size: 20px;
              font-weight: bold;
              font-family: 'Kanit', sans-serif;
              color: #fff;
              background: ${i===0?"#00AA66":"rgba(51, 51, 51, 0.9)"};
              border: 3px solid ${i===0?"#00FF88":"#555"};
              cursor: pointer;
              transition: all 0.15s;
            ">
              ${t.label}
            </button>
          `).join("")}
        </div>
      </div>
    `,this.contentContainer.querySelectorAll(".menu-btn").forEach(t=>{t.addEventListener("click",()=>{const i=t.getAttribute("data-action");i==="story_select"?this.renderStorySelect():i==="level_select"?this.setState("level_select"):i==="editor"?(this.setState("editor"),this.callbacks.onOpenEditor?.()):i==="options"&&this.setState("options")}),t.addEventListener("mouseenter",()=>{t.style.background="#00AA66",t.style.borderColor="#00FF88"}),t.addEventListener("mouseleave",()=>{t.style.background="#333",t.style.borderColor="#555"})})}renderLevelSelect(){const e=[{id:"ch1_office",name:"Cubicle Chaos",chapter:1,unlocked:!0},{id:"ch1_garage",name:"Parking Lot Panic",chapter:1,unlocked:!0},{id:"ch2_downtown",name:"Street Smart",chapter:2,unlocked:!0}],t=Ki(),i={S:"#FFD700",A:"#00FF88",B:"#4488FF",C:"#FF8844",D:"#FF4444"};this.contentContainer.innerHTML=`
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        padding-top: 60px;
        background: rgba(0, 0, 0, 0.7);
        pointer-events: auto;
      ">
        <div style="
          font-size: 36px;
          font-weight: bold;
          color: #00FF88;
          margin-bottom: 40px;
          font-family: 'Kanit', sans-serif;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        ">SELECT LEVEL</div>
        
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          max-width: 900px;
          width: 90%;
        ">
          ${e.map(s=>{const n=t[s.id],o=n?`<div style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-top: 12px;
                  padding-top: 10px;
                  border-top: 1px solid rgba(255,255,255,0.1);
                ">
                  <div style="
                    font-size: 12px;
                    color: #888;
                  ">HIGH SCORE</div>
                  <div style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  ">
                    <span style="
                      font-size: 16px;
                      color: #00FF88;
                      font-weight: bold;
                    ">${n.score.toLocaleString()}</span>
                    <span style="
                      font-size: 14px;
                      font-weight: bold;
                      color: ${i[n.rank]};
                      padding: 2px 6px;
                      background: rgba(0,0,0,0.3);
                      border-radius: 4px;
                    ">${n.rank}</span>
                  </div>
                </div>`:`<div style="
                  margin-top: 12px;
                  padding-top: 10px;
                  border-top: 1px solid rgba(255,255,255,0.1);
                  font-size: 12px;
                  color: #555;
                ">No high score yet</div>`;return`
              <button class="level-btn" data-id="${s.id}" style="
                padding: 25px;
                background: ${s.unlocked?"#2a2a4e":"#1a1a2e"};
                border: 3px solid ${s.unlocked?"#4a4a7e":"#333"};
                border-radius: 8px;
                cursor: ${s.unlocked?"pointer":"not-allowed"};
                text-align: left;
                transition: all 0.15s;
                opacity: ${s.unlocked?1:.5};
              ">
                <div style="
                  font-size: 12px;
                  color: #888;
                  margin-bottom: 5px;
                ">CHAPTER ${s.chapter}</div>
                <div style="
                  font-size: 18px;
                  font-weight: bold;
                  color: #fff;
                ">${s.name}</div>
                ${s.unlocked?o:'<div style="color: #ff6666; font-size: 12px; margin-top: 10px;">🔒 LOCKED</div>'}
              </button>
            `}).join("")}
        </div>
        
        <button id="back-btn" style="
          margin-top: 40px;
          padding: 12px 40px;
          font-size: 16px;
          background: #333;
          border: 2px solid #555;
          color: #fff;
          cursor: pointer;
        ">BACK</button>
      </div>
    `,this.contentContainer.querySelectorAll(".level-btn").forEach(s=>{const n=s.getAttribute("data-id");s.addEventListener("click",()=>{n&&this.startLevel(n)}),s.addEventListener("mouseenter",()=>{s.style.borderColor="#00FF88",s.style.background="#3a3a5e"}),s.addEventListener("mouseleave",()=>{s.style.borderColor="#4a4a7e",s.style.background="#2a2a4e"})}),this.contentContainer.querySelector("#back-btn")?.addEventListener("click",()=>{this.setState("menu")})}renderStorySelect(){const e=Ie.getState(),t={};for(const n of Yi)t[n.chapter]||(t[n.chapter]=[]),t[n.chapter].push(n);const i={1:"The Escape",2:"On The Run",3:"The Finale"};let s="";for(const[n,o]of Object.entries(t)){const a=i[parseInt(n)]||`Chapter ${n}`,r=o.map(l=>{const d=e.levelProgress[l.id],c=d?.unlocked??l.storyOrder===1,h=d?.completed??!1,u=d?.bestScore??0;let y="🔒";return c&&!h&&(y="▶️"),h&&(y="✅"),`
          <div class="story-level ${c?"unlocked":"locked"} ${h?"completed":""}"
               data-level-id="${l.id}"
               style="
                 display: flex;
                 align-items: center;
                 padding: 15px 20px;
                 background: ${c?"rgba(0, 100, 50, 0.3)":"rgba(50, 50, 50, 0.3)"};
                 border: 2px solid ${c?h?"#00FF88":"#88AA88":"#444"};
                 border-radius: 8px;
                 margin-bottom: 10px;
                 cursor: ${c?"pointer":"not-allowed"};
                 opacity: ${c?"1":"0.5"};
                 transition: all 0.2s;
               ">
            <span style="font-size: 24px; margin-right: 15px;">${y}</span>
            <div style="flex: 1;">
              <div style="font-size: 18px; font-weight: bold; color: #fff;">
                ${l.storyOrder}. ${l.name}
              </div>
              <div style="font-size: 12px; color: #888;">
                ${l.subtitle||l.description}
              </div>
            </div>
            ${h?`
              <div style="text-align: right;">
                <div style="font-size: 14px; color: #00FF88;">
                  ${u.toLocaleString()} 📈
                </div>
              </div>
            `:""}
          </div>
        `}).join("");s+=`
        <div style="margin-bottom: 30px;">
          <div style="
            font-size: 20px;
            font-weight: bold;
            color: #FFD700;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #333;
          ">
            Chapter ${n}: ${a}
          </div>
          ${r}
        </div>
      `}this.contentContainer.innerHTML=`
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        padding-top: 40px;
        background: rgba(0, 0, 0, 0.8);
        pointer-events: auto;
        overflow-y: auto;
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 90%;
          max-width: 800px;
          margin-bottom: 30px;
        ">
          <div style="
            font-size: 36px;
            font-weight: bold;
            color: #00FF88;
            font-family: 'Kanit', sans-serif;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
          ">📖 STORY MODE</div>
          <div style="
            font-size: 20px;
            color: #FFD700;
            font-family: 'Kanit', sans-serif;
          ">💰 ${e.totalStonks.toLocaleString()} Stonks</div>
        </div>
        
        <div style="
          width: 90%;
          max-width: 800px;
          margin-bottom: 30px;
        ">
          ${s}
        </div>
        
        <div style="
          display: flex;
          gap: 20px;
          margin-bottom: 40px;
        ">
          <button id="shop-btn" style="
            padding: 12px 30px;
            font-size: 16px;
            background: #FFD700;
            border: 2px solid #FFAA00;
            color: #000;
            cursor: pointer;
            font-family: 'Kanit', sans-serif;
            font-weight: bold;
          ">🛒 SHOP</button>
          
          <button id="back-btn" style="
            padding: 12px 30px;
            font-size: 16px;
            background: #333;
            border: 2px solid #555;
            color: #fff;
            cursor: pointer;
            font-family: 'Kanit', sans-serif;
          ">← BACK</button>
        </div>
      </div>
    `,this.contentContainer.querySelectorAll(".story-level.unlocked").forEach(n=>{n.addEventListener("click",()=>{const o=n.getAttribute("data-level-id");o&&this.startLevel(o)}),n.addEventListener("mouseenter",()=>{n.style.borderColor="#00FF88",n.style.background="rgba(0, 150, 75, 0.4)"}),n.addEventListener("mouseleave",()=>{const o=n.classList.contains("completed");n.style.borderColor=o?"#00FF88":"#88AA88",n.style.background="rgba(0, 100, 50, 0.3)"})}),this.contentContainer.querySelector("#shop-btn")?.addEventListener("click",()=>{console.log("Shop clicked - TODO: implement")}),this.contentContainer.querySelector("#back-btn")?.addEventListener("click",()=>{this.setState("menu")})}renderOptions(){this.playerPreview&&(this.playerPreview.dispose(),this.playerPreview=null);const e=yt(),t=[{id:"tony_stonks",name:"Tony Stonks"},{id:"stonks_guy",name:"Stonks Guy"}];this.contentContainer.innerHTML=`
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: rgba(0, 0, 0, 0.7);
        pointer-events: auto;
      ">
        <div style="
          font-size: 48px;
          font-weight: bold;
          color: #00FF88;
          margin-bottom: 40px;
          font-family: 'Kanit', sans-serif;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        ">OPTIONS</div>
        
        <div style="
          display: flex;
          gap: 40px;
          align-items: flex-start;
        ">
          <!-- Player Preview -->
          <div style="
            background: rgba(0,0,0,0.4);
            padding: 15px;
            border-radius: 10px;
            border: 2px solid #333;
          ">
            <div style="
              font-size: 14px;
              color: #888;
              margin-bottom: 10px;
              font-family: 'Kanit', sans-serif;
              text-align: center;
            ">PREVIEW</div>
            <div id="player-preview" style="
              width: 200px;
              height: 250px;
              border-radius: 8px;
              overflow: hidden;
            "></div>
          </div>
          
          <!-- Settings Panel -->
          <div style="
            background: rgba(0,0,0,0.3);
            padding: 30px 50px;
            border-radius: 10px;
            border: 2px solid #333;
          ">
            <!-- Player Selection -->
            <div style="margin-bottom: 30px;">
              <div style="
                font-size: 16px;
                color: #888;
                margin-bottom: 10px;
                font-family: 'Kanit', sans-serif;
              ">PLAYER CHARACTER</div>
              <div id="player-options" style="display: flex; gap: 15px;">
                ${t.map(o=>`
                  <button class="skin-btn" data-skin="${o.id}" style="
                    width: 160px;
                    padding: 15px 20px;
                    font-size: 16px;
                    font-weight: bold;
                    font-family: 'Kanit', sans-serif;
                    color: #fff;
                    background: ${e.playerSkin===o.id?"#00AA66":"#333"};
                    border: 3px solid ${e.playerSkin===o.id?"#00FF88":"#555"};
                    cursor: pointer;
                    transition: all 0.15s;
                  ">
                    ${o.name}
                  </button>
                `).join("")}
              </div>
            </div>
            
            <!-- Music Volume -->
            <div style="margin-bottom: 20px;">
              <div style="
                font-size: 16px;
                color: #888;
                margin-bottom: 10px;
                font-family: 'Kanit', sans-serif;
              ">MUSIC VOLUME</div>
              <input type="range" id="music-volume" min="0" max="100" value="${e.musicVolume*100}" style="
                width: 100%;
                height: 8px;
                cursor: pointer;
              ">
            </div>
            
            <!-- SFX Volume -->
            <div style="margin-bottom: 30px;">
              <div style="
                font-size: 16px;
                color: #888;
                margin-bottom: 10px;
                font-family: 'Kanit', sans-serif;
              ">SFX VOLUME</div>
              <input type="range" id="sfx-volume" min="0" max="100" value="${e.sfxVolume*100}" style="
                width: 100%;
                height: 8px;
                cursor: pointer;
              ">
            </div>
          </div>
        </div>
        
        <button id="back-btn" style="
          margin-top: 30px;
          width: 200px;
          padding: 15px 30px;
          font-size: 18px;
          font-weight: bold;
          font-family: 'Kanit', sans-serif;
          color: #fff;
          background: #333;
          border: 3px solid #555;
          cursor: pointer;
          transition: all 0.15s;
        ">BACK</button>
      </div>
    `;const i=this.contentContainer.querySelector("#player-preview");i&&(this.playerPreview=new La(i),this.playerPreview.loadSkin(e.playerSkin)),this.contentContainer.querySelectorAll(".skin-btn").forEach(o=>{o.addEventListener("click",()=>{const a=o.getAttribute("data-skin"),r=yt();r.playerSkin=a,vi(r),this.contentContainer.querySelectorAll(".skin-btn").forEach(l=>{const d=l.getAttribute("data-skin")===a;l.style.background=d?"#00AA66":"#333",l.style.borderColor=d?"#00FF88":"#555"}),this.playerPreview?.loadSkin(a),this.callbacks.onSkinChange?.(a)}),o.addEventListener("mouseenter",()=>{o.style.background="#00AA66",o.style.borderColor="#00FF88"}),o.addEventListener("mouseleave",()=>{const a=o.getAttribute("data-skin"),l=yt().playerSkin===a;o.style.background=l?"#00AA66":"#333",o.style.borderColor=l?"#00FF88":"#555"})});const s=this.contentContainer.querySelector("#music-volume"),n=this.contentContainer.querySelector("#sfx-volume");s?.addEventListener("input",()=>{const o=yt();o.musicVolume=parseInt(s.value)/100,vi(o)}),n?.addEventListener("input",()=>{const o=yt();o.sfxVolume=parseInt(n.value)/100,vi(o)}),this.contentContainer.querySelector("#back-btn")?.addEventListener("click",()=>{this.playerPreview&&(this.playerPreview.dispose(),this.playerPreview=null),this.setState("menu")})}renderPauseMenu(){const e=this.isPlayTesting?`
          <button class="pause-btn" data-action="backToEditor" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #AA6600;
            border: 3px solid #FF8800;
            color: #fff;
            cursor: pointer;
          ">BACK TO EDITOR</button>
    `:"";this.contentContainer.innerHTML=`
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: rgba(0, 0, 0, 0.8);
        pointer-events: auto;
      ">
        <div style="
          font-size: 48px;
          font-weight: bold;
          color: #FFD700;
          margin-bottom: 50px;
          font-family: 'Kanit', sans-serif;
        ">${this.isPlayTesting?"PLAY TEST":"PAUSED"}</div>
        
        <div style="display: flex; flex-direction: column; gap: 15px;">
          <button class="pause-btn" data-action="resume" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #00AA66;
            border: 3px solid #00FF88;
            color: #fff;
            cursor: pointer;
          ">RESUME</button>
          
          <button class="pause-btn" data-action="retry" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">RETRY</button>
          
          <button class="pause-btn" data-action="controls" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">CONTROLS</button>
          
          ${e}
          
          <button class="pause-btn" data-action="quit" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">QUIT</button>
        </div>
      </div>
    `,this.contentContainer.querySelectorAll(".pause-btn").forEach(t=>{t.addEventListener("click",()=>{switch(t.getAttribute("data-action")){case"resume":this.setState("playing"),this.callbacks.onResume?.();break;case"retry":this.callbacks.onRetry?.(),this.setState("playing");break;case"controls":this.showControlsOverlay();break;case"backToEditor":this.isPlayTesting=!1,this.callbacks.onBackToEditor?.();break;case"quit":this.callbacks.onQuit?.(),this.setState("menu");break}})})}showControlsOverlay(){const e=document.createElement("div");e.id="controls-overlay",e.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: rgba(0, 0, 0, 0.95);
      z-index: 1000;
      pointer-events: auto;
    `,e.innerHTML=`
      <div style="
        font-size: 36px;
        font-weight: bold;
        color: #00FF88;
        margin-bottom: 30px;
        font-family: 'Kanit', sans-serif;
      ">CONTROLS</div>
      
      <div style="
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px 60px;
        font-family: 'Kanit', sans-serif;
        max-width: 700px;
      ">
        <div style="text-align: right; color: #FFD700; font-size: 16px;">W</div>
        <div style="color: #fff; font-size: 16px;">Push Forward</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">S</div>
        <div style="color: #fff; font-size: 16px;">Brake</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">A / D</div>
        <div style="color: #fff; font-size: 16px;">Turn Left / Right</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">SPACE</div>
        <div style="color: #fff; font-size: 16px;">Jump (Ollie)</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">↑ near rail</div>
        <div style="color: #fff; font-size: 16px;">Grind</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">← + W/A/S/D</div>
        <div style="color: #fff; font-size: 16px;">Flip Tricks (in air)</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">→ + W/A/S/D</div>
        <div style="color: #fff; font-size: 16px;">Grab Tricks (in air)</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">Q / E</div>
        <div style="color: #fff; font-size: 16px;">Spin Left / Right (in air)</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">Mouse Drag</div>
        <div style="color: #fff; font-size: 16px;">Rotate Camera</div>
        
        <div style="text-align: right; color: #FFD700; font-size: 16px;">ESC</div>
        <div style="color: #fff; font-size: 16px;">Pause</div>
      </div>
      
      <div style="
        margin-top: 20px;
        padding: 15px 30px;
        background: #222;
        border-radius: 8px;
        color: #888;
        font-size: 14px;
        text-align: center;
      ">
        💡 Chain tricks together for combo multipliers!<br>
        Land safely to bank your points.
      </div>
      
      <button id="close-controls" style="
        margin-top: 30px;
        padding: 15px 50px;
        font-size: 18px;
        background: #00AA66;
        border: 3px solid #00FF88;
        color: #fff;
        cursor: pointer;
        font-family: 'Kanit', sans-serif;
      ">BACK</button>
    `,this.uiContainer.appendChild(e),e.querySelector("#close-controls")?.addEventListener("click",()=>{e.remove()})}renderResults(){if(!this.lastResult)return;const e=this.lastResult,t={S:"#FFD700",A:"#00FF88",B:"#4488FF",C:"#FF8844",D:"#FF4444"},i=e.isNewHighScore?`<div style="
          font-size: 28px;
          color: #FFD700;
          margin-bottom: 20px;
          animation: newHighScore 0.5s ease-out infinite alternate;
          text-shadow: 0 0 10px #FFD700, 0 0 20px #FF6B00;
        ">🏆 NEW HIGH SCORE! 🏆</div>
        ${e.previousHighScore!==null?`
          <div style="
            font-size: 14px;
            color: #888;
            margin-bottom: 20px;
          ">Previous best: ${e.previousHighScore.toLocaleString()}</div>
        `:""}`:e.previousHighScore!==null?`
        <div style="
          font-size: 16px;
          color: #888;
          margin-bottom: 20px;
        ">High Score: ${e.previousHighScore.toLocaleString()}</div>
      `:"";this.contentContainer.innerHTML=`
      <style>
        @keyframes newHighScore {
          0% { transform: scale(1); }
          100% { transform: scale(1.05); }
        }
      </style>
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 36px;
          color: #fff;
          margin-bottom: 20px;
        ">LEVEL COMPLETE!</div>
        
        ${i}
        
        <div style="
          font-size: 120px;
          font-weight: bold;
          color: ${t[e.rank]};
          text-shadow: 4px 4px 0px rgba(0,0,0,0.5);
          margin-bottom: 30px;
        ">${e.rank}</div>
        
        <div style="
          background: rgba(0,0,0,0.3);
          padding: 30px 50px;
          border-radius: 10px;
          margin-bottom: 40px;
        ">
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
            margin-bottom: 15px;
            gap: 40px;
          ">
            <span>SCORE:</span>
            <span style="color: #00FF88;">${e.score.toLocaleString()}</span>
          </div>
          
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
            margin-bottom: 15px;
          ">
            <span>TIME:</span>
            <span>${this.formatTime(e.time)}</span>
          </div>
          
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
          ">
            <span>GOALS:</span>
            <span>${e.goalsCompleted} / ${e.totalGoals}</span>
          </div>
        </div>
        
        <div style="display: flex; gap: 20px;">
          <button class="result-btn" data-action="retry" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #00AA66;
            border: 3px solid #00FF88;
            color: #fff;
            cursor: pointer;
          ">RETRY</button>
          
          <button class="result-btn" data-action="next" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #4466AA;
            border: 3px solid #6688CC;
            color: #fff;
            cursor: pointer;
          ">NEXT LEVEL</button>
          
          <button class="result-btn" data-action="menu" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">MENU</button>
        </div>
      </div>
    `,this.contentContainer.querySelectorAll(".result-btn").forEach(s=>{s.addEventListener("click",()=>{switch(s.getAttribute("data-action")){case"retry":this.startLevel(this.currentLevelId);break;case"next":this.setState("level_select");break;case"menu":this.setState("menu");break}})})}formatTime(e){const t=Math.floor(e/60),i=Math.floor(e%60);return`${t}:${i.toString().padStart(2,"0")}`}}const Ra={idle:["Breakdance_1990","breakdance 1990"],rolling:["Breakdance_1990","breakdance 1990"],trick:["Dozing_Elderly","dozing elderly"],push:["Bar_Hang_Idle","bar hang idle"],standtosit:["Bar_Hang_Idle","bar hang idle"],chairhold:["slide_light","slide light"],jump:["Jump_Over_Obstacle","jump over obstacle"],roll:["Parkour_Vault","parkour vault"],slide:["Step_Forward_and_Push","step forward"],crash:["falling_down","falling down","fall"]},_a={idle:["Bar_Hang_Idle","bar hang idle"],rolling:["Bar_Hang_Idle","bar hang idle"],push:["Step_Forward_and_Push","step forward"],chairhold:["slide_light","slide light"],trick:["Breakdance_1990","breakdance"],standtosit:["Look_Back_and_Sit","look back"],jump:["Parkour_Vault_1","parkour vault 1"],roll:["Running","running"],slide:["Cautious_Crouch_Walk","cautious crouch"],crash:["Character_output","character output"]};function Ia(p){switch(p){case"stonks_guy":return _a;case"tony_stonks":default:return Ra}}class Oa{model=null;mixer=null;animations=new Map;currentAnimation=null;gltfLoader;fbxLoader;currentSkin="tony_stonks";constructor(){this.gltfLoader=new Ut,this.fbxLoader=new tn}getSkinFileName(e){switch(e){case"stonks_guy":return"./models/player-stonks.fbx";case"tony_stonks":default:return"./models/player-combined.fbx"}}getCurrentSkin(){return this.currentSkin}async changeSkin(e){if(e===this.currentSkin&&this.model)return;console.log(`Hot-swapping skin to: ${e}`);const t=this.model?.parent,i=this.localPosition.clone();this.model&&t&&t.remove(this.model),this.model=null,this.animations.clear(),this.mixer=null,this.currentAnimation=null,this.currentSkin=e;const s=await this.loadSkin(e);t&&s&&t.add(s),this.setLocalPosition(i.x,i.y,i.z),this.play("idle"),console.log(`Skin changed to: ${e}, model attached: ${!!t}`)}async loadSkin(e){const t=this.getSkinFileName(e);console.log(`Loading skin file: ${t}`);let i=null,s=[],n=!1;try{i=await this.fbxLoader.loadAsync(t),s=i.animations||[],n=!0,console.log(`Successfully loaded FBX: ${t} with ${s.length} animations`)}catch{console.warn(`FBX not found: ${t}, trying GLB fallbacks...`);try{i=await this.fbxLoader.loadAsync("./models/player-combined.fbx"),s=i.animations||[],n=!0,console.log("Loaded default player-combined.fbx")}catch{console.warn("player-combined.fbx not found, trying GLB...");try{const l=await this.gltfLoader.loadAsync("./models/player.glb");i=l.scene,s=l.animations||[],console.log("Loaded player.glb (GLB fallback)")}catch(l){throw console.error("Failed to load any player model!",l),l}}}this.model=i;const o=n?.006:.6;return this.model.scale.set(o,o,o),this.model.position.set(0,0,0),this.model.traverse(a=>{a instanceof f&&(a.castShadow=!0,a.receiveShadow=!0)}),this.mixer=new Xi(this.model),s.length>0&&(console.log(`Loading ${s.length} animations from combined file`),this.loadAnimationsFromCombined(s)),this.animations.size<3&&(console.log("Not enough animations from combined file, loading separately..."),await this.loadAnimationsSeparately()),console.log(`Skin loaded with ${this.animations.size} animations`),this.model}async load(){const e=yt();return this.currentSkin=e.playerSkin,console.log(`Initial load - skin from settings: ${this.currentSkin}`),this.loadSkin(this.currentSkin)}loadAnimationsFromCombined(e){console.log(`=== ALL ${e.length} ANIMATIONS IN FBX (skin: ${this.currentSkin}) ===`),e.forEach((i,s)=>{console.log(`  [${s}] "${i.name}" (${i.duration.toFixed(2)}s, ${i.tracks.length} tracks)`)}),console.log("=== END ANIMATION LIST ===");const t=Ia(this.currentSkin);console.log(`=== ANIMATION MAPPINGS FOR ${this.currentSkin} ===`);for(const[i,s]of Object.entries(t))console.log(`  ${i}: looking for ${JSON.stringify(s)}`);console.log("=== END MAPPINGS ===");for(const[i,s]of Object.entries(t)){console.log(`
Searching for: ${i}...`);const n=this.findClip(e,s,i);if(n){const o=this.mixer.clipAction(n);this.animations.set(i,{clip:n,action:o}),console.log(`✓ Mapped animation: ${i} -> ${n.name}`)}else console.warn(`✗ Animation not found in combined file: ${i} (looked for: ${s.join(", ")})`)}console.log("=== FINAL ANIMATION MAP ==="),this.animations.forEach((i,s)=>{console.log(`  ${s} -> "${i.clip.name}" (${i.clip.duration.toFixed(2)}s)`)})}normalizeForMatch(e){return e.toLowerCase().replace(/_/g," ").replace(/\.fbx$/i,"").replace(/\.glb$/i,"").replace(/frame rate \d+/i,"").replace(/\s+/g," ").trim()}findClip(e,t,i){for(const s of t){const n=s.toLowerCase();for(const o of e){const a=o.name.toLowerCase(),r=a.replace(/\.fbx$/i,"");if(a===n||r===n)return i&&console.log(`  [${i}] EXACT MATCH: "${s}" -> "${o.name}"`),o}}for(const s of t){const n=this.normalizeForMatch(s);for(const o of e)if(this.normalizeForMatch(o.name)===n)return i&&console.log(`  [${i}] NORMALIZED EXACT: "${n}" -> "${o.name}"`),o}for(const s of t){const n=this.normalizeForMatch(s);for(const o of e){const a=this.normalizeForMatch(o.name);if(a.startsWith(n))return i&&console.log(`  [${i}] PREFIX MATCH: "${n}" -> "${o.name}" (clip: "${a}")`),o}}for(const s of t){const n=this.normalizeForMatch(s);for(const o of e){const a=this.normalizeForMatch(o.name);if(a.includes(n))return i&&console.log(`  [${i}] CONTAINS MATCH: "${n}" in "${o.name}" (clip: "${a}")`),o}}return i&&console.log(`  [${i}] NO MATCH FOUND`),null}async loadAnimationsSeparately(){const e=[{name:"idle",file:"./models/anim-sit-idle.glb"},{name:"push",file:"./models/anim-push.glb"},{name:"standtosit",file:"./models/anim-standtosit.glb"},{name:"rolling",file:"./models/anim-rolling.glb"},{name:"chairhold",file:"./models/anim-chairhold.glb"},{name:"trick",file:"./models/anim-trick.glb"},{name:"jump",file:"./models/anim-jump.glb"},{name:"roll",file:"./models/anim-roll.glb"},{name:"slide",file:"./models/anim-slide.glb"},{name:"crash",file:"./models/anim-crash.glb"}];for(const t of e)try{const i=await this.gltfLoader.loadAsync(t.file);if(i.animations.length>0){const s=i.animations[0];s.name=t.name;const n=this.mixer.clipAction(s);this.animations.set(t.name,{clip:s,action:n}),console.log(`Loaded animation: ${t.name}`)}}catch(i){console.warn(`Failed to load animation ${t.name}:`,i)}}play(e,t){let i=this.animations.get(e);if(!i&&(console.warn(`Animation not found: ${e}, falling back to idle`),e!=="idle"&&(i=this.animations.get("idle")),!i)){console.warn("No animations available");return}if(console.log(`▶️ Playing "${e}" -> clip: "${i.clip.name}" (duration: ${i.clip.duration.toFixed(2)}s, tracks: ${i.clip.tracks.length})`),this.currentAnimation===e&&i.action.isRunning())return;const s=t?.fadeTime??.3,n=t?.loop??!0;if(i.action.setLoop(n?Ns:js,1/0),i.action.clampWhenFinished=!n,this.currentAnimation&&this.currentAnimation!==e){const o=this.animations.get(this.currentAnimation);o&&o.action.fadeOut(s)}i.action.reset(),i.action.fadeIn(s),i.action.play(),this.currentAnimation=e}playOnce(e,t){if(!this.animations.get(e)){this.play(t);return}this.play(e,{loop:!1});const s=()=>{this.mixer?.removeEventListener("finished",s),this.play(t)};this.mixer?.addEventListener("finished",s)}localPosition=new m(-.2,-.1,0);setLocalPosition(e,t,i){this.localPosition.set(e,t,i)}update(e){this.mixer&&this.mixer.update(e),this.model&&(this.model.position.copy(this.localPosition),this.model.rotation.set(0,0,0))}getModel(){return this.model}getCurrentAnimation(){return this.currentAnimation}isPlaying(e){return this.currentAnimation===e}hasAnimation(e){return this.animations.has(e)}}class Fa{audioContext=null;masterGain=null;isInitialized=!1;wheelRollNoise=null;wheelRollGain=null;wheelRollFilter=null;wheelRollActive=!1;init(){if(!this.isInitialized)try{this.audioContext=new(window.AudioContext||window.webkitAudioContext),this.masterGain=this.audioContext.createGain(),this.masterGain.gain.value=.5,this.masterGain.connect(this.audioContext.destination),this.isInitialized=!0,console.log("Procedural audio initialized")}catch(e){console.warn("Web Audio API not supported:",e)}}async resume(){this.audioContext?.state==="suspended"&&await this.audioContext.resume()}setVolume(e){this.masterGain&&(this.masterGain.gain.value=Math.max(0,Math.min(1,e)))}playPush(){if(!this.audioContext||!this.masterGain)return;const e=this.audioContext.createOscillator(),t=this.audioContext.createGain();e.type="sine",e.frequency.setValueAtTime(80,this.audioContext.currentTime),e.frequency.exponentialRampToValueAtTime(40,this.audioContext.currentTime+.1),t.gain.setValueAtTime(.4,this.audioContext.currentTime),t.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.15),e.connect(t),t.connect(this.masterGain),e.start(),e.stop(this.audioContext.currentTime+.15)}playJump(){if(!this.audioContext||!this.masterGain)return;const e=this.audioContext.createOscillator(),t=this.audioContext.createGain(),i=this.audioContext.createBiquadFilter();e.type="sawtooth",e.frequency.setValueAtTime(100,this.audioContext.currentTime),e.frequency.exponentialRampToValueAtTime(300,this.audioContext.currentTime+.15),i.type="lowpass",i.frequency.setValueAtTime(2e3,this.audioContext.currentTime),t.gain.setValueAtTime(.2,this.audioContext.currentTime),t.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.2),e.connect(i),i.connect(t),t.connect(this.masterGain),e.start(),e.stop(this.audioContext.currentTime+.2)}playLand(){if(!this.audioContext||!this.masterGain)return;const e=this.audioContext.sampleRate*.1,t=this.audioContext.createBuffer(1,e,this.audioContext.sampleRate),i=t.getChannelData(0);for(let a=0;a<e;a++)i[a]=(Math.random()*2-1)*Math.pow(1-a/e,2);const s=this.audioContext.createBufferSource();s.buffer=t;const n=this.audioContext.createBiquadFilter();n.type="lowpass",n.frequency.value=500;const o=this.audioContext.createGain();o.gain.value=.3,s.connect(n),n.connect(o),o.connect(this.masterGain),s.start()}playGrindStart(){if(!this.audioContext||!this.masterGain)return;const e=this.audioContext.sampleRate*.2,t=this.audioContext.createBuffer(1,e,this.audioContext.sampleRate),i=t.getChannelData(0);for(let a=0;a<e;a++)i[a]=Math.random()*2-1;const s=this.audioContext.createBufferSource();s.buffer=t;const n=this.audioContext.createBiquadFilter();n.type="bandpass",n.frequency.value=3e3,n.Q.value=5;const o=this.audioContext.createGain();o.gain.setValueAtTime(.15,this.audioContext.currentTime),o.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.2),s.connect(n),n.connect(o),o.connect(this.masterGain),s.start()}grindOscillator=null;grindGain=null;startGrindLoop(){if(!this.audioContext||!this.masterGain||this.grindOscillator)return;const e=this.audioContext.sampleRate*2,t=this.audioContext.createBuffer(1,e,this.audioContext.sampleRate),i=t.getChannelData(0);for(let o=0;o<e;o++)i[o]=(Math.random()*2-1)*(.3+Math.sin(o*.01)*.2);const s=this.audioContext.createBufferSource();s.buffer=t,s.loop=!0;const n=this.audioContext.createBiquadFilter();n.type="bandpass",n.frequency.value=2500,n.Q.value=3,this.grindGain=this.audioContext.createGain(),this.grindGain.gain.value=.08,s.connect(n),n.connect(this.grindGain),this.grindGain.connect(this.masterGain),s.start(),this.grindOscillator=s}stopGrindLoop(){this.grindOscillator&&(this.grindOscillator.stop(),this.grindOscillator=null,this.grindGain=null)}playTrick(e=500){if(!this.audioContext||!this.masterGain)return;const t=this.audioContext.createOscillator(),i=this.audioContext.createGain(),n=.7+Math.max(100,Math.min(2500,e))/2500*.9,o=880*n,a=1100*n;t.type="sine",t.frequency.setValueAtTime(o,this.audioContext.currentTime),t.frequency.setValueAtTime(a,this.audioContext.currentTime+.05);const r=.15+(n-.7)*.1;i.gain.setValueAtTime(r,this.audioContext.currentTime),i.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.3),t.connect(i),i.connect(this.masterGain),t.start(),t.stop(this.audioContext.currentTime+.3)}playChaChing(e=1e3){if(!this.audioContext||!this.masterGain)return;const i=900+Math.max(0,Math.min(1,e/2e4))*400,s=this.audioContext.createOscillator(),n=this.audioContext.createGain();s.type="triangle",s.frequency.setValueAtTime(i*1.5,this.audioContext.currentTime),s.frequency.exponentialRampToValueAtTime(i*2.2,this.audioContext.currentTime+.04),s.frequency.exponentialRampToValueAtTime(i*.9,this.audioContext.currentTime+.25),n.gain.setValueAtTime(0,this.audioContext.currentTime),n.gain.linearRampToValueAtTime(.22,this.audioContext.currentTime+.02),n.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.45),s.connect(n),n.connect(this.masterGain),s.start(),s.stop(this.audioContext.currentTime+.45);const o=this.audioContext.createOscillator(),a=this.audioContext.createGain();if(o.type="sine",o.frequency.setValueAtTime(200,this.audioContext.currentTime),o.frequency.exponentialRampToValueAtTime(80,this.audioContext.currentTime+.08),a.gain.setValueAtTime(.3,this.audioContext.currentTime),a.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.15),o.connect(a),a.connect(this.masterGain),o.start(),o.stop(this.audioContext.currentTime+.15),e>5e3){const r=this.audioContext.createOscillator(),l=this.audioContext.createGain();r.type="sine",r.frequency.setValueAtTime(i*3,this.audioContext.currentTime+.06),r.frequency.exponentialRampToValueAtTime(i*4.5,this.audioContext.currentTime+.12),l.gain.setValueAtTime(0,this.audioContext.currentTime+.06),l.gain.linearRampToValueAtTime(.12,this.audioContext.currentTime+.09),l.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.3),r.connect(l),l.connect(this.masterGain),r.start(this.audioContext.currentTime+.06),r.stop(this.audioContext.currentTime+.3)}}playComboLanded(e){if(!this.audioContext||!this.masterGain)return;const t=440,i=[0,4,7,12],s=Math.min(e,4);for(let n=0;n<s;n++)setTimeout(()=>{if(!this.audioContext||!this.masterGain)return;const o=this.audioContext.createOscillator(),a=this.audioContext.createGain();o.type="triangle";const r=t*Math.pow(2,i[n]/12);o.frequency.value=r,a.gain.setValueAtTime(.15,this.audioContext.currentTime),a.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.2),o.connect(a),a.connect(this.masterGain),o.start(),o.stop(this.audioContext.currentTime+.2)},n*50)}playBail(){if(!this.audioContext||!this.masterGain)return;const e=this.audioContext.sampleRate*.3,t=this.audioContext.createBuffer(1,e,this.audioContext.sampleRate),i=t.getChannelData(0);for(let l=0;l<e;l++)i[l]=(Math.random()*2-1)*Math.pow(1-l/e,1.5);const s=this.audioContext.createBufferSource();s.buffer=t;const n=this.audioContext.createBiquadFilter();n.type="lowpass",n.frequency.value=800;const o=this.audioContext.createGain();o.gain.value=.4,s.connect(n),n.connect(o),o.connect(this.masterGain),s.start();const a=this.audioContext.createOscillator(),r=this.audioContext.createGain();a.type="sawtooth",a.frequency.setValueAtTime(200,this.audioContext.currentTime),a.frequency.exponentialRampToValueAtTime(50,this.audioContext.currentTime+.3),r.gain.setValueAtTime(.2,this.audioContext.currentTime),r.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.3),a.connect(r),r.connect(this.masterGain),a.start(),a.stop(this.audioContext.currentTime+.3)}playSpecialReady(){if(!this.audioContext||!this.masterGain)return;[523.25,659.25,783.99,1046.5].forEach((t,i)=>{setTimeout(()=>{if(!this.audioContext||!this.masterGain)return;const s=this.audioContext.createOscillator(),n=this.audioContext.createGain();s.type="triangle",s.frequency.value=t,n.gain.setValueAtTime(.1,this.audioContext.currentTime),n.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.5),s.connect(n),n.connect(this.masterGain),s.start(),s.stop(this.audioContext.currentTime+.5)},i*30)})}balanceWarningOsc=null;balanceWarningGain=null;balanceWarningActive=!1;startBalanceWarning(){if(!this.audioContext||!this.masterGain||this.balanceWarningActive)return;this.balanceWarningOsc=this.audioContext.createOscillator(),this.balanceWarningGain=this.audioContext.createGain(),this.balanceWarningOsc.type="square",this.balanceWarningOsc.frequency.value=180;const e=this.audioContext.createOscillator(),t=this.audioContext.createGain();e.type="sine",e.frequency.value=6,t.gain.value=.08,e.connect(t),t.connect(this.balanceWarningGain.gain),this.balanceWarningGain.gain.value=.06,this.balanceWarningOsc.connect(this.balanceWarningGain),this.balanceWarningGain.connect(this.masterGain),this.balanceWarningOsc.start(),e.start(),this.balanceWarningActive=!0}updateBalanceWarning(e){if(!this.balanceWarningGain||!this.balanceWarningOsc||!this.audioContext)return;const t=Math.abs(.5-e),i=.25,s=.4;if(t<i){this.balanceWarningGain.gain.linearRampToValueAtTime(0,this.audioContext.currentTime+.1);return}const n=Math.min(1,(t-i)/(s-i)),o=.04+n*.08;this.balanceWarningGain.gain.linearRampToValueAtTime(o,this.audioContext.currentTime+.05);const a=180+n*100;this.balanceWarningOsc.frequency.linearRampToValueAtTime(a,this.audioContext.currentTime+.05)}stopBalanceWarning(){this.balanceWarningOsc&&(this.balanceWarningOsc.stop(),this.balanceWarningOsc=null,this.balanceWarningGain=null,this.balanceWarningActive=!1)}playMenuSelect(){if(!this.audioContext||!this.masterGain)return;const e=this.audioContext.createOscillator(),t=this.audioContext.createGain();e.type="square",e.frequency.setValueAtTime(440,this.audioContext.currentTime),e.frequency.setValueAtTime(550,this.audioContext.currentTime+.05),t.gain.setValueAtTime(.1,this.audioContext.currentTime),t.gain.exponentialRampToValueAtTime(.01,this.audioContext.currentTime+.1),e.connect(t),t.connect(this.masterGain),e.start(),e.stop(this.audioContext.currentTime+.1)}startWheelRoll(){if(!this.audioContext||!this.masterGain||this.wheelRollActive)return;const e=this.audioContext.sampleRate*2,t=this.audioContext.createBuffer(1,e,this.audioContext.sampleRate),i=t.getChannelData(0);for(let s=0;s<e;s++){const n=Math.random()*2-1,o=Math.sin(s*.02)*.3,a=.7+Math.sin(s*.001)*.3;i[s]=n*a*.5+o*.2}this.wheelRollNoise=this.audioContext.createBufferSource(),this.wheelRollNoise.buffer=t,this.wheelRollNoise.loop=!0,this.wheelRollFilter=this.audioContext.createBiquadFilter(),this.wheelRollFilter.type="lowpass",this.wheelRollFilter.frequency.value=200,this.wheelRollFilter.Q.value=1,this.wheelRollGain=this.audioContext.createGain(),this.wheelRollGain.gain.value=0,this.wheelRollNoise.connect(this.wheelRollFilter),this.wheelRollFilter.connect(this.wheelRollGain),this.wheelRollGain.connect(this.masterGain),this.wheelRollNoise.start(),this.wheelRollActive=!0}updateWheelRoll(e,t){if(!this.wheelRollGain||!this.wheelRollFilter||!this.audioContext)return;if(!t||e<.5){this.wheelRollGain.gain.linearRampToValueAtTime(0,this.audioContext.currentTime+.1);return}const i=Math.min(1,e/18),s=.02+i*.1;this.wheelRollGain.gain.linearRampToValueAtTime(s,this.audioContext.currentTime+.05);const n=200+i*600;this.wheelRollFilter.frequency.linearRampToValueAtTime(n,this.audioContext.currentTime+.05)}stopWheelRoll(){this.wheelRollNoise&&(this.wheelRollNoise.stop(),this.wheelRollNoise=null,this.wheelRollGain=null,this.wheelRollFilter=null,this.wheelRollActive=!1)}}const J=new Fa;class Da{particles=[];geometry;material;points;scene;MAX_PARTICLES=100;PARTICLE_LIFETIME=.5;SPAWN_RATE=60;spawnAccumulator=0;constructor(e){this.scene=e,this.geometry=new Oe;const t=new Float32Array(this.MAX_PARTICLES*3),i=new Float32Array(this.MAX_PARTICLES*3);this.geometry.setAttribute("position",new Le(t,3)),this.geometry.setAttribute("color",new Le(i,3)),this.material=new zi({size:.15,vertexColors:!0,transparent:!0,opacity:.9,blending:zs,depthWrite:!1}),this.points=new Ui(this.geometry,this.material),this.scene.add(this.points)}spawn(e,t,i=3){for(let s=0;s<i&&this.particles.length<this.MAX_PARTICLES;s++){const n=new m((Math.random()-.5)*4,Math.random()*3+1,(Math.random()-.5)*4);n.add(t.clone().multiplyScalar(Math.random()*2)),this.particles.push({position:e.clone(),velocity:n,life:this.PARTICLE_LIFETIME,maxLife:this.PARTICLE_LIFETIME})}}update(e,t,i,s){if(t&&i&&s)for(this.spawnAccumulator+=e*this.SPAWN_RATE;this.spawnAccumulator>=1&&this.particles.length<this.MAX_PARTICLES;)this.spawnAccumulator-=1,this.spawn(i,s,1);else this.spawnAccumulator=0;const n=new m(0,-15,0);for(let o=this.particles.length-1;o>=0;o--){const a=this.particles[o];a.velocity.add(n.clone().multiplyScalar(e)),a.position.add(a.velocity.clone().multiplyScalar(e)),a.life-=e,a.life<=0&&this.particles.splice(o,1)}this.updateGeometry()}updateGeometry(){const e=this.geometry.attributes.position.array,t=this.geometry.attributes.color.array;for(let i=0;i<this.MAX_PARTICLES;i++)if(i<this.particles.length){const s=this.particles[i],n=s.life/s.maxLife;e[i*3]=s.position.x,e[i*3+1]=s.position.y,e[i*3+2]=s.position.z,t[i*3]=1,t[i*3+1]=.5+n*.5,t[i*3+2]=n*.3}else e[i*3]=0,e[i*3+1]=-1e3,e[i*3+2]=0;this.geometry.attributes.position.needsUpdate=!0,this.geometry.attributes.color.needsUpdate=!0}dispose(){this.scene.remove(this.points),this.geometry.dispose(),this.material.dispose()}}class Ga{particles=[];geometry;material;points;scene;MAX_PARTICLES=50;PARTICLE_LIFETIME=.6;constructor(e){this.scene=e,this.geometry=new Oe;const t=new Float32Array(this.MAX_PARTICLES*3),i=new Float32Array(this.MAX_PARTICLES*3),s=new Float32Array(this.MAX_PARTICLES);this.geometry.setAttribute("position",new Le(t,3)),this.geometry.setAttribute("color",new Le(i,3)),this.geometry.setAttribute("size",new Le(s,1)),this.material=new zi({size:.3,vertexColors:!0,transparent:!0,opacity:.6,blending:In,depthWrite:!1,sizeAttenuation:!0}),this.points=new Ui(this.geometry,this.material),this.scene.add(this.points)}spawn(e,t=.5){const i=Math.floor(8+t*15);for(let s=0;s<i&&this.particles.length<this.MAX_PARTICLES;s++){const n=Math.random()*Math.PI*2,o=1.5+Math.random()*3*t,a=new m(Math.cos(n)*o,.5+Math.random()*2*t,Math.sin(n)*o),r=e.clone();r.y=.1+Math.random()*.2,r.x+=(Math.random()-.5)*.5,r.z+=(Math.random()-.5)*.5,this.particles.push({position:r,velocity:a,life:this.PARTICLE_LIFETIME*(.5+Math.random()*.5),maxLife:this.PARTICLE_LIFETIME,scale:.15+Math.random()*.25*t})}}update(e){const i=new m(0,-2,0);for(let s=this.particles.length-1;s>=0;s--){const n=this.particles[s];n.velocity.multiplyScalar(1-3*e),n.velocity.add(i.clone().multiplyScalar(e)),n.position.add(n.velocity.clone().multiplyScalar(e)),n.position.y<.05&&(n.position.y=.05,n.velocity.y=0,n.velocity.x*=.5,n.velocity.z*=.5),n.life-=e,n.life<=0&&this.particles.splice(s,1)}this.updateGeometry()}updateGeometry(){const e=this.geometry.attributes.position.array,t=this.geometry.attributes.color.array;for(let i=0;i<this.MAX_PARTICLES;i++)if(i<this.particles.length){const s=this.particles[i],n=s.life/s.maxLife;e[i*3]=s.position.x,e[i*3+1]=s.position.y,e[i*3+2]=s.position.z;const o=n*n;t[i*3]=.6*o,t[i*3+1]=.5*o,t[i*3+2]=.4*o}else e[i*3]=0,e[i*3+1]=-1e3,e[i*3+2]=0;this.geometry.attributes.position.needsUpdate=!0,this.geometry.attributes.color.needsUpdate=!0}dispose(){this.scene.remove(this.points),this.geometry.dispose(),this.material.dispose()}}class Ba{lines=[];geometry;material;lineSegments;camera;MAX_LINES=40;SPEED_THRESHOLD=10;FULL_EFFECT_SPEED=18;LINE_LIFETIME=.15;SPAWN_RATE=80;MIN_RADIUS=.7;MAX_RADIUS=.95;spawnAccumulator=0;currentIntensity=0;constructor(e){this.camera=e,this.geometry=new Oe;const t=new Float32Array(this.MAX_LINES*6),i=new Float32Array(this.MAX_LINES*6);this.geometry.setAttribute("position",new Le(t,3)),this.geometry.setAttribute("color",new Le(i,3)),this.material=new ai({vertexColors:!0,transparent:!0,opacity:.8,blending:zs,depthWrite:!1,depthTest:!1}),this.lineSegments=new Os(this.geometry,this.material),this.lineSegments.frustumCulled=!1,this.lineSegments.renderOrder=999}getMesh(){return this.lineSegments}spawn(){if(this.lines.length>=this.MAX_LINES)return;const e=Math.random()*Math.PI*2,t=Math.pow(Math.random(),.5),i=this.MIN_RADIUS+t*(this.MAX_RADIUS-this.MIN_RADIUS),s=2,n=1.2,o=Math.cos(e)*i*n,a=Math.sin(e)*i*n,r=8+Math.random()*4,l=new m(-Math.cos(e)*r,-Math.sin(e)*r,r*.5),c=(.15+this.currentIntensity*.25)*(.8+Math.random()*.4);this.lines.push({position:new m(o,a,s),velocity:l,length:c,life:this.LINE_LIFETIME*(.8+Math.random()*.4),maxLife:this.LINE_LIFETIME,angle:e})}update(e,t,i){const s=this.FULL_EFFECT_SPEED-this.SPEED_THRESHOLD,n=(t-this.SPEED_THRESHOLD)/s,o=Math.max(0,Math.min(1,n)),a=o>this.currentIntensity?8:4;if(this.currentIntensity+=(o-this.currentIntensity)*a*e,this.currentIntensity>.05){const r=i?1:1.3,l=this.SPAWN_RATE*this.currentIntensity*r;for(this.spawnAccumulator+=e*l;this.spawnAccumulator>=1&&this.lines.length<this.MAX_LINES;)this.spawnAccumulator-=1,this.spawn()}for(let r=this.lines.length-1;r>=0;r--){const l=this.lines[r];l.position.add(l.velocity.clone().multiplyScalar(e)),l.life-=e,l.life<=0&&this.lines.splice(r,1)}this.updateGeometry()}updateGeometry(){const e=this.geometry.attributes.position.array,t=this.geometry.attributes.color.array,i=new m,s=new G;this.camera.getWorldPosition(i),this.camera.getWorldQuaternion(s);for(let n=0;n<this.MAX_LINES;n++){const o=n*6;if(n<this.lines.length){const a=this.lines[n],r=a.life/a.maxLife,l=a.position.clone(),d=l.clone();d.x+=Math.cos(a.angle)*a.length,d.y+=Math.sin(a.angle)*a.length,l.applyQuaternion(s),l.add(i),d.applyQuaternion(s),d.add(i),e[o]=l.x,e[o+1]=l.y,e[o+2]=l.z,e[o+3]=d.x,e[o+4]=d.y,e[o+5]=d.z;const h=r*r*this.currentIntensity;t[o]=.9*h,t[o+1]=.95*h,t[o+2]=1*h,t[o+3]=.7*h,t[o+4]=.8*h,t[o+5]=1*h}else e[o]=0,e[o+1]=-1e3,e[o+2]=0,e[o+3]=0,e[o+4]=-1e3,e[o+5]=0,t[o]=0,t[o+1]=0,t[o+2]=0,t[o+3]=0,t[o+4]=0,t[o+5]=0}this.geometry.attributes.position.needsUpdate=!0,this.geometry.attributes.color.needsUpdate=!0}getIntensity(){return this.currentIntensity}setIntensity(e){this.currentIntensity=Math.max(0,Math.min(1,e))}dispose(){this.geometry.dispose(),this.material.dispose()}}const Na=[{id:"ch1_office",chapter:1,name:"Cubicle Chaos",subtitle:"The Great Escape Begins",description:"Navigate through the open office floor as SEC agents close in!",skyColor:"#87CEEB",skyColorTop:"#1e90ff",skyColorBottom:"#87CEEB",fogColor:"#a0a0a0",fogNear:30,fogFar:100,ambientLight:.5,sunIntensity:.8,groundSize:80,groundColor:"#555555",spawnPoint:{position:[0,.5,0],rotation:0},bounds:{minX:-38,maxX:38,minZ:-38,maxZ:38},objects:[{type:"cubicle",position:[-15,0,-10],params:{width:3,depth:3}},{type:"cubicle",position:[-15,0,-5],params:{width:3,depth:3}},{type:"cubicle",position:[-15,0,0],params:{width:3,depth:3}},{type:"cubicle",position:[-15,0,5],params:{width:3,depth:3}},{type:"cubicle",position:[-15,0,10],params:{width:3,depth:3}},{type:"cubicle",position:[15,0,-10],params:{width:3,depth:3}},{type:"cubicle",position:[15,0,-5],params:{width:3,depth:3}},{type:"cubicle",position:[15,0,0],params:{width:3,depth:3}},{type:"cubicle",position:[15,0,5],params:{width:3,depth:3}},{type:"cubicle",position:[15,0,10],params:{width:3,depth:3}},{type:"rail",position:[-10,0,-15],params:{length:20}},{type:"rail",position:[10,0,-15],params:{length:20}},{type:"rail",position:[0,0,15],params:{length:25}},{type:"ramp",position:[-5,0,0],rotation:[0,90,0]},{type:"ramp",position:[5,0,0],rotation:[0,-90,0]},{type:"water_cooler",position:[-20,0,0]},{type:"water_cooler",position:[20,0,0]},{type:"fun_box",position:[0,0,-20],params:{width:8,depth:4,height:.8}},{type:"stairs",position:[0,0,25],rotation:[0,180,0],params:{steps:5}}],collectibles:[{type:"document",position:[-10,1,-10],value:100},{type:"document",position:[10,1,-10],value:100},{type:"document",position:[0,2,15],value:250},{type:"money",position:[-15,1,0],value:500},{type:"money",position:[15,1,0],value:500}],goals:[{type:"score",target:5e3,description:"Score 5,000 points",reward:1e3},{type:"grind",target:3,description:"Grind 3 desk rails",reward:500},{type:"collect",target:5,description:"Collect all shredded documents",reward:2e3}],timeLimit:120,introDialogue:["SEC AGENT: We have a warrant for Tony Stonks!","TONY: Time to roll! Literally!","OBJECTIVE: Escape through the office before they catch you!"]},{id:"ch1_garage",chapter:1,name:"Parking Lot Panic",subtitle:"Underground Getaway",description:"Shred through the parking garage to reach your getaway vehicle!",skyColor:"#333333",skyColorTop:"#1a1a2e",skyColorBottom:"#333333",fogColor:"#222222",fogNear:20,fogFar:80,ambientLight:.3,sunIntensity:.2,groundSize:100,groundColor:"#444444",spawnPoint:{position:[0,.5,-40],rotation:0},bounds:{minX:-45,maxX:45,minZ:-45,maxZ:45},objects:[{type:"car",position:[-20,0,-30],rotation:[0,0,0]},{type:"car",position:[-20,0,-20],rotation:[0,0,0]},{type:"car",position:[-20,0,-10],rotation:[0,0,0]},{type:"car",position:[-20,0,0],rotation:[0,0,0]},{type:"car",position:[20,0,-30],rotation:[0,180,0]},{type:"car",position:[20,0,-20],rotation:[0,180,0]},{type:"car",position:[20,0,-10],rotation:[0,180,0]},{type:"car",position:[20,0,0],rotation:[0,180,0]},{type:"rail",position:[0,0,-35],params:{length:30}},{type:"rail",position:[0,0,-15],params:{length:30}},{type:"rail",position:[0,0,5],params:{length:30}},{type:"ramp",position:[-10,0,25],rotation:[0,0,0]},{type:"ramp",position:[10,0,25],rotation:[0,0,0]},{type:"quarter_pipe",position:[-40,0,0],rotation:[0,90,0]},{type:"quarter_pipe",position:[40,0,0],rotation:[0,-90,0]},{type:"cone",position:[-5,0,30]},{type:"cone",position:[0,0,30]},{type:"cone",position:[5,0,30]},{type:"barrier",position:[0,0,35],params:{length:10}}],goals:[{type:"score",target:1e4,description:"Score 10,000 points",reward:2e3},{type:"combo",target:5e3,description:"Land a 5,000 point combo",reward:1500},{type:"escape",target:1,description:"Reach the exit ramp",reward:3e3}],timeLimit:180},{id:"ch2_downtown",chapter:2,name:"Street Smart",subtitle:"Urban Jungle",description:"Hit the streets and show off your skills while evading pursuit!",skyColor:"#6699CC",skyColorTop:"#4a90d9",skyColorBottom:"#87ceeb",fogColor:"#888888",fogNear:40,fogFar:150,ambientLight:.6,sunIntensity:1,groundSize:150,groundColor:"#333333",spawnPoint:{position:[0,.5,-60],rotation:0},bounds:{minX:-70,maxX:70,minZ:-70,maxZ:70},objects:[{type:"bench",position:[-15,0,-40]},{type:"bench",position:[-15,0,-20]},{type:"bench",position:[-15,0,0]},{type:"bench",position:[15,0,-40]},{type:"bench",position:[15,0,-20]},{type:"bench",position:[15,0,0]},{type:"planter",position:[-30,0,-30]},{type:"planter",position:[30,0,-30]},{type:"planter",position:[-30,0,30]},{type:"planter",position:[30,0,30]},{type:"stairs",position:[0,0,-50],params:{steps:8}},{type:"rail",position:[-3,0,-50],params:{length:10},rotation:[15,0,0]},{type:"rail",position:[3,0,-50],params:{length:10},rotation:[15,0,0]},{type:"half_pipe",position:[0,0,30],params:{width:15,length:20}},{type:"trash_can",position:[-25,0,0]},{type:"trash_can",position:[25,0,0]}],goals:[{type:"score",target:25e3,description:"Score 25,000 points",reward:5e3},{type:"combo",target:1e4,description:"Land a 10,000 point combo",reward:3e3},{type:"grind",target:10,description:"Grind 10 rails",reward:2e3},{type:"time",target:120,description:"Survive for 2 minutes",reward:2500}],timeLimit:180}];function ja(p){const e=Na.find(i=>i.id===p);if(e)return e;const t=Yi.find(i=>i.id===p);if(t)return t}class ln{mesh;material;constructor(){const e=new pe(450,32,16);this.material=new Hs({uniforms:{topColor:{value:new B(2003199)},bottomColor:{value:new B(8900331)}},vertexShader:`
        varying float vY;
        void main() {
          // Use local position Y normalized to sphere radius
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying float vY;
        void main() {
          // vY goes from -1 (bottom) to 1 (top)
          // Map to 0..1 for mixing
          float t = vY * 0.5 + 0.5;
          // Apply slight curve for more natural sky look
          t = pow(t, 0.8);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,side:Us,depthWrite:!1,depthTest:!1,fog:!1}),this.mesh=new f(e,this.material),this.mesh.frustumCulled=!1,this.mesh.renderOrder=-1e3}getMesh(){return this.mesh}setColors(e,t){this.material.uniforms.topColor.value.set(e),this.material.uniforms.bottomColor.value.set(t)}setTopColor(e){this.material.uniforms.topColor.value.set(e)}setBottomColor(e){this.material.uniforms.bottomColor.value.set(e)}update(e){this.mesh.position.copy(e)}dispose(){this.mesh.geometry.dispose(),this.material.dispose()}}const Si={clear_day:{top:"#1e90ff",bottom:"#87ceeb",name:"Clear Day",icon:"☀️"},night:{top:"#0a0a1a",bottom:"#1a1a2e",name:"Night",icon:"🌙"},sunset:{top:"#2c3e50",bottom:"#ff7b00",name:"Sunset",icon:"🌅"},pink_dusk:{top:"#4a3f55",bottom:"#ff9a9e",name:"Pink Dusk",icon:"🌸"},overcast:{top:"#4a5568",bottom:"#718096",name:"Overcast",icon:"🌧️"},midnight:{top:"#000011",bottom:"#0f0c29",name:"Midnight",icon:"🌌"},cloudy:{top:"#94a3b8",bottom:"#cbd5e1",name:"Cloudy",icon:"☁️"},dawn:{top:"#1e3a5f",bottom:"#ff9966",name:"Dawn",icon:"🌄"},stormy:{top:"#1a1a2e",bottom:"#4a4a6a",name:"Stormy",icon:"⛈️"},tropical:{top:"#00b4db",bottom:"#0083b0",name:"Tropical",icon:"🏝️"}};class za{container;_isVisible=!1;chaseBar=null;warningText=null;boostIndicator=null;constructor(e){this.container=e,this.createElements()}createElements(){const e=document.createElement("style");e.textContent=`
      .chase-hud {
        position: absolute;
        top: 100px;
        left: 20px;
        width: 200px;
        font-family: 'Kanit', sans-serif;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
      }
      
      .chase-hud.visible {
        opacity: 1;
      }
      
      .chase-label {
        color: #ff4444;
        font-size: 14px;
        letter-spacing: 2px;
        margin-bottom: 5px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .chase-icon {
        animation: pulseIcon 0.5s infinite alternate;
      }
      
      @keyframes pulseIcon {
        from { opacity: 0.7; }
        to { opacity: 1; }
      }
      
      .chase-bar-container {
        width: 100%;
        height: 12px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid #ff4444;
        border-radius: 6px;
        overflow: hidden;
        position: relative;
      }
      
      .chase-bar-fill {
        height: 100%;
        transition: width 0.1s, background 0.3s;
        border-radius: 4px;
      }
      
      .chase-bar-fill.safe {
        background: linear-gradient(90deg, #00ff88, #00aa55);
      }
      
      .chase-bar-fill.warning {
        background: linear-gradient(90deg, #ffff00, #ffaa00);
      }
      
      .chase-bar-fill.danger {
        background: linear-gradient(90deg, #ff8800, #ff4400);
        animation: dangerPulse 0.5s infinite alternate;
      }
      
      .chase-bar-fill.critical {
        background: linear-gradient(90deg, #ff0000, #aa0000);
        animation: criticalPulse 0.3s infinite alternate;
      }
      
      @keyframes dangerPulse {
        from { filter: brightness(1); }
        to { filter: brightness(1.3); }
      }
      
      @keyframes criticalPulse {
        from { filter: brightness(1); transform: scaleY(1); }
        to { filter: brightness(1.5); transform: scaleY(1.1); }
      }
      
      .chase-warning {
        color: #ff4444;
        font-size: 18px;
        font-weight: bold;
        margin-top: 10px;
        text-shadow: 0 0 10px #ff0000;
        animation: warningBlink 0.4s infinite alternate;
        text-align: center;
      }
      
      @keyframes warningBlink {
        from { opacity: 0.6; }
        to { opacity: 1; }
      }
      
      .chase-boost {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #00ff88;
        font-size: 12px;
      }
      
      .chase-boost-bar {
        flex: 1;
        height: 6px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 3px;
        overflow: hidden;
      }
      
      .chase-boost-fill {
        height: 100%;
        background: linear-gradient(90deg, #00ff88, #00ffff);
        transition: width 0.1s;
        border-radius: 3px;
      }
    `,document.head.appendChild(e);const t=document.createElement("div");t.className="chase-hud",t.innerHTML=`
      <div class="chase-label">
        <span class="chase-icon">🚨</span>
        <span>SEC AGENTS</span>
      </div>
      <div class="chase-bar-container">
        <div class="chase-bar-fill safe" style="width: 50%"></div>
      </div>
      <div class="chase-warning" style="display: none">THEY'RE CATCHING UP!</div>
      <div class="chase-boost">
        <span>⚡ BOOST</span>
        <div class="chase-boost-bar">
          <div class="chase-boost-fill" style="width: 0%"></div>
        </div>
      </div>
    `,this.container.appendChild(t),this.chaseBar=t.querySelector(".chase-bar-fill"),this.warningText=t.querySelector(".chase-warning"),this.boostIndicator=t.querySelector(".chase-boost-fill")}show(){this._isVisible=!0;const e=this.container.querySelector(".chase-hud");e&&e.classList.add("visible")}hide(){this._isVisible=!1;const e=this.container.querySelector(".chase-hud");e&&e.classList.remove("visible")}get isVisible(){return this._isVisible}update(e){if(!this.chaseBar||!this.warningText||!this.boostIndicator)return;this.chaseBar.style.width=`${e.chaseDistance}%`,this.chaseBar.className=`chase-bar-fill ${e.warningLevel}`,this.warningText.style.display=e.warningLevel==="critical"?"block":"none";const t=e.playerSpeedBoost/20*100;this.boostIndicator.style.width=`${t}%`}}class Ha{container;dialogueElement=null;textElement=null;currentLines=[];currentIndex=0;isTyping=!1;typeTimeout=null;callbacks;constructor(e,t={}){this.container=e,this.callbacks=t,this.createElements()}createElements(){const e=document.createElement("style");e.textContent=`
      .dialogue-box {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        width: 90%;
        max-width: 700px;
        background: rgba(0, 0, 0, 0.9);
        border: 3px solid #00FF88;
        border-radius: 10px;
        padding: 20px 30px;
        font-family: 'Kanit', sans-serif;
        z-index: 100;
        display: none;
        pointer-events: auto;
      }
      
      .dialogue-box.visible {
        display: block;
        animation: dialogueSlideIn 0.3s ease-out;
      }
      
      @keyframes dialogueSlideIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      
      .dialogue-text {
        font-size: 20px;
        color: #fff;
        line-height: 1.5;
        margin-bottom: 15px;
        min-height: 60px;
      }
      
      .dialogue-continue {
        font-size: 14px;
        color: #888;
        text-align: right;
        animation: blink 1s infinite;
      }
      
      @keyframes blink {
        0%, 45% { opacity: 1; }
        50%, 100% { opacity: 0.3; }
      }
      
      .dialogue-speaker {
        font-size: 16px;
        color: #FFD700;
        margin-bottom: 10px;
        font-weight: bold;
      }
    `,document.head.appendChild(e);const t=document.createElement("div");t.className="dialogue-box",t.innerHTML=`
      <div class="dialogue-speaker"></div>
      <div class="dialogue-text"></div>
      <div class="dialogue-continue">Press SPACE to continue...</div>
    `,this.container.appendChild(t),this.dialogueElement=t,this.textElement=t.querySelector(".dialogue-text"),window.addEventListener("keydown",this.handleInput.bind(this)),t.addEventListener("click",()=>this.advance())}handleInput(e){this.dialogueElement?.classList.contains("visible")&&(e.code==="Space"||e.code==="Enter"?(e.preventDefault(),this.advance()):e.code==="Escape"&&(e.preventDefault(),this.skip()))}show(e){if(e.length===0){this.callbacks.onComplete?.();return}this.currentLines=e,this.currentIndex=0,this.dialogueElement?.classList.add("visible"),this.showLine(this.currentLines[0])}hide(){this.dialogueElement?.classList.remove("visible"),this.typeTimeout&&(clearTimeout(this.typeTimeout),this.typeTimeout=null),this.isTyping=!1}showLine(e){if(!this.textElement)return;const t=e.match(/^([A-Z📰🚁🎉]+(?:\s+[A-Z]+)?):?\s*/),i=this.dialogueElement?.querySelector(".dialogue-speaker");if(t){const s=t[1],n=e.slice(t[0].length);i&&(i.textContent=s,i.style.display="block"),this.typeText(n)}else i&&(i.style.display="none"),this.typeText(e)}typeText(e){if(!this.textElement)return;this.isTyping=!0,this.textElement.textContent="";let t=0;const i=()=>{t<e.length?(this.textElement.textContent+=e[t],t++,this.typeTimeout=window.setTimeout(i,30)):this.isTyping=!1};i()}advance(){if(this.isTyping){this.typeTimeout&&(clearTimeout(this.typeTimeout),this.typeTimeout=null);const e=this.currentLines[this.currentIndex],t=e.match(/^([A-Z📰🚁🎉]+(?:\s+[A-Z]+)?):?\s*/),i=t?e.slice(t[0].length):e;this.textElement&&(this.textElement.textContent=i),this.isTyping=!1;return}this.currentIndex++,this.currentIndex>=this.currentLines.length?(this.hide(),this.callbacks.onComplete?.()):this.showLine(this.currentLines[this.currentIndex])}skip(){this.hide(),this.callbacks.onSkip?.()}}const Zt={idle:["idle","Idle","IDLE","stand","Stand","Armature|idle","Armature|Idle"],walk:["walk","Walk","WALK","walking","Walking","Armature|walk","Armature|Walk"],run:["run","Run","RUN","running","Running","jog","Jog","Armature|run","Armature|Run"],stun:["stun","Stun","fall","Fall","hit","Hit","death","Death","Armature|fall"]};class gs{group;mixer=null;clips=new Map;currentAction=null;state="IDLE";config;callbacks;patrolIndex=0;patrolDirection=1;stunTimer=0;animNames={idle:"",walk:"",run:"",stun:null};loaded=!1;constructor(e,t={}){this.group=new A,this.group.position.copy(e.position),this.config={position:e.position.clone(),patrolPoints:e.patrolPoints||[],detectionRange:e.detectionRange??15,chaseRange:e.chaseRange??25,catchRange:e.catchRange??2,walkSpeed:e.walkSpeed??3,runSpeed:e.runSpeed??7,stunDuration:e.stunDuration??3e3},this.callbacks=t}async load(e){const i=await(e||new Ut).loadAsync("./models/npc-officer.glb"),s=i.scene;return s.scale.set(1,1,1),s.traverse(n=>{n instanceof f&&(n.castShadow=!0,n.receiveShadow=!0)}),this.group.add(s),this.mixer=new Xi(s),console.log(`[NPCOfficer] Available animation clips (${i.animations.length}):`),i.animations.forEach((n,o)=>{console.log(`  [${o}] "${n.name}" (duration: ${n.duration.toFixed(2)}s)`),this.clips.set(n.name,n)}),this.animNames.idle=this.findBestClip(Zt.idle)||i.animations[0]?.name||"",this.animNames.walk=this.findBestClip(Zt.walk)||this.animNames.idle,this.animNames.run=this.findBestClip(Zt.run)||this.animNames.walk,this.animNames.stun=this.findBestClip(Zt.stun)||null,console.log("[NPCOfficer] Resolved animations:",this.animNames),this.loaded=!0,this.playAnim(this.animNames.idle,!0),this.group}findBestClip(e){for(const i of e)if(this.clips.has(i))return i;const t=e.map(i=>i.toLowerCase());for(const[i]of this.clips)if(t.includes(i.toLowerCase()))return i;return null}playAnim(e,t=!0,i=.3){if(!this.mixer||!e)return;const s=this.clips.get(e);if(!s)return;const n=this.mixer.clipAction(s);n.setLoop(t?Ns:js,1/0),n.clampWhenFinished=!t,this.currentAction&&this.currentAction!==n?(n.reset(),n.play(),this.currentAction.crossFadeTo(n,i,!0)):(n.reset(),n.play()),this.currentAction=n}update(e,t){if(!this.loaded||!this.mixer)return;if(this.mixer.update(e),this.state==="STUNNED"){this.stunTimer-=e*1e3,this.stunTimer<=0&&this.setState("IDLE");return}const s=this.group.position.distanceTo(t);s<=this.config.detectionRange?this.state!=="CHASING"&&this.setState("CHASING"):s>this.config.chaseRange&&this.state==="CHASING"&&this.setState(this.config.patrolPoints.length>0?"WALKING":"IDLE");const n=this.state;n==="WALKING"?this.updatePatrol(e):n==="CHASING"&&(this.moveToward(t,this.config.runSpeed,e),s<=this.config.catchRange&&this.callbacks.onCaught?.())}moveToward(e,t,i){const s=this.group.position,n=new m().subVectors(e,s).setY(0).normalize(),o=n.multiplyScalar(t*i);if(s.add(o),n.lengthSq()>.001){const a=Math.atan2(n.x,n.z);this.group.rotation.y=a}}updatePatrol(e){if(this.config.patrolPoints.length===0){this.setState("IDLE");return}const t=this.config.patrolPoints[this.patrolIndex];this.group.position.distanceTo(t)<1?(this.patrolIndex+=this.patrolDirection,this.patrolIndex>=this.config.patrolPoints.length?(this.patrolIndex=this.config.patrolPoints.length-2,this.patrolDirection=-1):this.patrolIndex<0&&(this.patrolIndex=1,this.patrolDirection=1)):this.moveToward(t,this.config.walkSpeed,e)}setState(e){if(this.state!==e)switch(this.state=e,e){case"IDLE":this.playAnim(this.animNames.idle,!0);break;case"WALKING":this.playAnim(this.animNames.walk,!0);break;case"CHASING":this.playAnim(this.animNames.run,!0);break;case"STUNNED":this.animNames.stun&&this.playAnim(this.animNames.stun,!1);break}}stun(){this.stunTimer=this.config.stunDuration,this.setState("STUNNED")}startChase(){this.setState("CHASING")}getGroup(){return this.group}getState(){return this.state}setPosition(e){this.group.position.copy(e)}dispose(){this.mixer&&(this.mixer.stopAllAction(),this.mixer=null)}}class Ua{canvas;isRunning=!1;isPaused=!1;lastTime=0;accumulator=0;currentLevelId="";levelTime=0;onLevelComplete;onDialogueStart;onDialogueEnd;onCheckpointReached;onChaseStateChange;onOfficerCaught;chaseMechanic;chaseHUD=null;dialogueBox=null;currentStoryLevel=null;checkpoints=[];lastCheckpointIndex=-1;checkpointPosition=null;checkpointRotation=0;speedMultiplier=1;jumpMultiplier=1;spinMultiplier=1;grindBalanceDrift=.5;manualBalanceDrift=.5;PHYSICS_TIMESTEP=1/60;MAX_FRAME_SKIP=5;COYOTE_TIME_MS=80;scene;camera;renderer;skyGradient;ambientLight;sunLight;hemiLight;fillLight;input;physics;grindSystem;grindParticles;landingParticles;speedLines;cameraController;trickDetector;comboSystem;hud;playerModel;chair;chairBody;useGLBModel=!0;wheelMeshes=[];levelObjects=[];modelCache=new Map;gltfLoader;npcOfficers=[];officerCaughtCooldown=0;playerState={isGrounded:!0,isAirborne:!1,isGrinding:!1,isManualing:!1,hasSpecial:!1,airTime:0};specialMeter=0;grindBalance=.5;grindScore=0;totalStonks=0;manualBalance=.5;lastTrickTime=0;queuedTrick=null;spinRotation=0;cumulativeSpinDegrees=0;airStartRotation=0;lastGroundedTime=0;lastPushSoundTime=0;surfaceNormal=new m(0,1,0);surfaceAngle=0;GROUND_SNAP_DISTANCE=1.5;LAUNCH_ANGLE=45;debugAnimIndex=0;debugAnimLockUntil=0;constructor(e){this.canvas=e}onProgress;async init(e){console.log("Game.init() starting..."),this.onProgress=e;const t=(i,s)=>{console.log(`[${i}%] ${s}`),this.onProgress?.(i,s)};try{t(0,"Initializing renderer..."),this.initRenderer(),t(10,"Setting up scene..."),this.initScene(),t(20,"Loading physics engine..."),this.physics=new To,await this.physics.init(),t(40,"Configuring input..."),this.initInput(),t(45,"Setting up grind system..."),this.grindSystem=new ko,this.grindParticles=new Da(this.scene),this.landingParticles=new Ga(this.scene),this.speedLines=new Ba(this.camera),this.scene.add(this.speedLines.getMesh()),t(50,"Loading trick system..."),this.initTricks(),t(55,"Building UI..."),this.initUI(),t(60,"Loading player model..."),await this.initPlayer(),t(75,"Loading level assets..."),await this.preloadLevelModels(),t(85,"Building environment..."),this.initEnvironment(),t(95,"Initializing audio..."),J.init(),window.addEventListener("resize",this.onResize.bind(this)),window.addEventListener("keydown",i=>{(i.key==="["||i.key==="]")&&this.debugCycleAnimation(i.key==="]"?1:-1)}),t(100,"Ready!"),console.log("Game.init() complete!")}catch(i){throw console.error("Error in Game.init():",i),i}}initRenderer(){this.renderer=new $i({canvas:this.canvas,antialias:!0,powerPreference:"high-performance"}),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)),this.renderer.setSize(window.innerWidth,window.innerHeight),this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=On,this.renderer.outputColorSpace=ue,this.renderer.toneMapping=Fn,this.renderer.toneMappingExposure=1.2}initScene(){this.scene=new Vi,this.scene.background=null,this.scene.fog=new es(8900331,50,200),this.skyGradient=new ln,this.scene.add(this.skyGradient.getMesh()),this.camera=new qt(60,window.innerWidth/window.innerHeight,.1,1e3),this.camera.position.set(0,5,-10),this.camera.lookAt(0,0,0),this.ambientLight=new li(16777215,.7),this.scene.add(this.ambientLight),this.hemiLight=new Dn(8900331,6710886,.8),this.scene.add(this.hemiLight),this.sunLight=new xt(16777215,1.5),this.sunLight.position.set(50,100,50),this.sunLight.castShadow=!0,this.sunLight.shadow.mapSize.width=2048,this.sunLight.shadow.mapSize.height=2048,this.sunLight.shadow.camera.near=10,this.sunLight.shadow.camera.far=200,this.sunLight.shadow.camera.left=-50,this.sunLight.shadow.camera.right=50,this.sunLight.shadow.camera.top=50,this.sunLight.shadow.camera.bottom=-50,this.scene.add(this.sunLight),this.fillLight=new xt(16777215,.5),this.fillLight.position.set(-30,40,-30),this.scene.add(this.fillLight),this.cameraController=new Co(this.camera),this.cameraController.setupMouseControls(this.canvas)}initInput(){this.input=new So}initTricks(){this.trickDetector=new Eo,this.comboSystem=new Mo}initUI(){const e=document.getElementById("ui-overlay");e&&(this.hud=new Ao(e),this.comboSystem.on(t=>{this.hud.onComboEvent(t);const i=this.comboSystem.getState();if(this.hud.updateCombo(i.tricks,i.totalPoints,i.multiplier),this.hud.updateComboTimer(i.timeRemaining,2e3),t.type==="combo_landed"&&t.totalScore){if(J.playChaChing(t.totalScore),J.playComboLanded(i.multiplier),this.cameraController.impactZoomPulse(t.totalScore),this.chaseMechanic?.isChaseActive()){const s=Math.min(5,t.totalScore/2e3);this.chaseMechanic.addSpeedBoost(s)}}else t.type==="combo_failed"&&(J.playBail(),this.cameraController.shake(.8,.4))}),this.initStorySystems(e))}initStorySystems(e){this.dialogueBox=new Ha(e,{onComplete:()=>{this.onDialogueEnd?.(),this.isPaused=!1},onSkip:()=>{this.onDialogueEnd?.(),this.isPaused=!1}}),this.chaseHUD=new za(e),this.chaseMechanic=new Ca({onCaught:()=>{console.log("Player caught by agents!"),this.cameraController.shake(1.5,.6),this.lastCheckpointIndex>=0&&this.checkpointPosition?this.restoreCheckpoint():this.endLevel(!1)},onWarningChange:t=>{this.onChaseStateChange?.(this.chaseMechanic.getState())},onSpeedBoost:t=>{this.speedLines.setIntensity(Math.min(1,t/10))}})}loadUpgradeEffects(){this.currentStoryLevel||this.currentLevelId.startsWith("story_")?(this.speedMultiplier=Ie.getUpgradeEffect("speed"),this.jumpMultiplier=Ie.getUpgradeEffect("jumpHeight"),this.spinMultiplier=Ie.getUpgradeEffect("spinSpeed"),this.grindBalanceDrift=Ie.getUpgradeEffect("grindBalance"),this.manualBalanceDrift=Ie.getUpgradeEffect("manualBalance"),console.log("Upgrade effects loaded:",{speed:this.speedMultiplier,jump:this.jumpMultiplier,spin:this.spinMultiplier,grindBalance:this.grindBalanceDrift,manualBalance:this.manualBalanceDrift})):(this.speedMultiplier=1,this.jumpMultiplier=1,this.spinMultiplier=1,this.grindBalanceDrift=.5,this.manualBalanceDrift=.5)}showIntroDialogue(e){this.dialogueBox&&e.length>0&&(this.isPaused=!0,this.onDialogueStart?.(),this.dialogueBox.show(e))}showOutroDialogue(e){this.dialogueBox&&e.length>0&&(this.isPaused=!0,this.onDialogueStart?.(),this.dialogueBox.show(e))}updateCheckpoints(){if(!this.currentStoryLevel||this.checkpoints.length===0)return;const e=this.chair.position;for(let t=this.lastCheckpointIndex+1;t<this.checkpoints.length;t++){const i=this.checkpoints[t],s=new m(i.position[0],i.position[1],i.position[2]);if(e.distanceTo(s)<5){this.triggerCheckpoint(t,i);break}}}triggerCheckpoint(e,t){this.lastCheckpointIndex=e,this.checkpointPosition=this.chair.position.clone(),this.checkpointRotation=this.chair.rotation.y,Ie.setCheckpoint(this.currentLevelId,e),t.dialogue&&t.dialogue.length>0&&this.showOutroDialogue(t.dialogue),this.onCheckpointReached?.(e,t.name),console.log(`Checkpoint reached: ${t.name}`)}restoreCheckpoint(){this.checkpointPosition&&this.chairBody&&(this.physics.setPosition(this.chairBody,this.checkpointPosition),this.physics.setRotationY(this.chairBody,this.checkpointRotation),this.physics.setVelocity(this.chairBody,new m(0,0,0)),this.playerState.isGrounded=!0,this.playerState.isAirborne=!1,this.comboSystem.reset(),this.currentStoryLevel?.hasChaseMechanic&&this.chaseMechanic.start(this.currentStoryLevel.chaseSpeed||8,50))}endLevel(e){e&&this.currentStoryLevel?.outroDialogue&&this.showOutroDialogue(this.currentStoryLevel.outroDialogue),this.chaseMechanic?.stop(),this.chaseHUD?.hide(),this.onLevelComplete?.(this.totalStonks,this.levelTime,0,0)}async initPlayer(){this.chair=new A,this.chair.position.set(0,0,5),this.scene.add(this.chair);const e=new Ut;try{const i=(await e.loadAsync("./models/chair.glb")).scene;i.scale.set(.35,.35,.35),i.position.set(0,-.3,0),this.wheelMeshes=[],i.traverse(s=>{s instanceof f&&(s.castShadow=!0,s.receiveShadow=!0);const n=s.name.toLowerCase();(n.includes("wheel")||n.includes("caster")||n.includes("roller"))&&this.wheelMeshes.push(s)}),this.chair.add(i),console.log(`Chair GLB model loaded with ${this.wheelMeshes.length} wheel meshes`)}catch(t){console.warn("Failed to load chair GLB, using primitives:",t);const i=this.createChairMesh();this.chair.add(i)}if(this.useGLBModel)try{this.playerModel=new Oa;const t=await this.playerModel.load();this.playerModel.setLocalPosition(0,0,-1.2),t.position.set(0,0,-1.2),t.rotation.y=0,this.playerModel.play("idle"),this.isMounted=!1,this.animState="standing",this.chair.add(t),console.log("GLB player model attached to chair")}catch(t){console.warn("Failed to load GLB model, using primitives:",t),this.useGLBModel=!1}this.chairBody=this.physics.createChairBody(new m(0,0,5)),this.cameraController.setTarget(this.chair)}createChairMesh(){const e=new A,t=new T({color:1710638,roughness:.8}),i=new T({color:4473924,metalness:.7,roughness:.3}),s=new T({color:2236962,roughness:.9}),n=new k(.5,.08,.5),o=new f(n,t);o.position.y=.45,o.castShadow=!0,e.add(o);const a=new k(.45,.06,.45),r=new T({color:2960708,roughness:.9}),l=new f(a,r);l.position.y=.52,l.castShadow=!0,e.add(l);const d=new k(.48,.5,.06),c=new f(d,t);c.position.set(0,.72,.25),c.rotation.x=-.1,c.castShadow=!0,e.add(c);const h=new k(.06,.04,.25),u=new f(h,i);u.position.set(-.28,.58,.08),u.castShadow=!0,e.add(u);const y=new f(h,i);y.position.set(.28,.58,.08),y.castShadow=!0,e.add(y);const b=new O(.02,.02,.12),w=new f(b,i);w.position.set(-.28,.52,.08),e.add(w);const x=new f(b,i);x.position.set(.28,.52,.08),e.add(x);const v=new O(.03,.03,.32),S=new f(v,i);S.position.y=.26,e.add(S);const C=.28,P=5;for(let pt=0;pt<P;pt++){const Ce=pt/P*Math.PI*2,Mt=new k(.04,.03,C),it=new f(Mt,i);it.position.set(Math.sin(Ce)*C*.5,.08,Math.cos(Ce)*C*.5),it.rotation.y=-Ce,it.castShadow=!0,e.add(it);const ci=new pe(.04,12,8),ut=new f(ci,s);ut.position.set(Math.sin(Ce)*C,.04,Math.cos(Ce)*C),ut.castShadow=!0,e.add(ut);const di=new O(.025,.035,.05),Xt=new f(di,i);Xt.position.set(Math.sin(Ce)*C,.065,Math.cos(Ce)*C),e.add(Xt)}const L=new T({color:16767916,roughness:.8}),M=new T({color:4878245,roughness:.7}),_=new T({color:12886874,roughness:.8}),U=new T({color:2763306,roughness:.9}),q=new T({color:4006676,roughness:.9}),oe=new A;oe.position.set(0,.55,0);const W=new A;W.position.set(0,.4,0),W.rotation.x=.2;const ce=new k(.32,.4,.18),te=new f(ce,M);te.castShadow=!0,W.add(te);const K=new A;K.position.set(0,.28,0);const Z=new pe(.11,12,10),ie=new f(Z,L);ie.castShadow=!0,K.add(ie);const ge=new pe(.115,12,6,0,Math.PI*2,0,Math.PI*.55),z=new f(ge,q);z.position.y=.02,z.castShadow=!0,K.add(z),W.add(K);const Q=new A;Q.position.set(-.18,.12,0),Q.rotation.z=.4,Q.rotation.x=.8;const ye=new Ot(.04,.18,4,8),ae=new f(ye,M);ae.position.y=-.12,ae.castShadow=!0,Q.add(ae);const fe=new A;fe.position.set(0,-.22,0),fe.rotation.x=-1;const ve=new Ot(.035,.16,4,8),Ge=new f(ve,L);Ge.position.y=-.1,Ge.castShadow=!0,fe.add(Ge);const Qe=new pe(.04,8,6),Be=new f(Qe,L);Be.position.y=-.2,Be.castShadow=!0,fe.add(Be),Q.add(fe),W.add(Q);const Se=new A;Se.position.set(.18,.12,0),Se.rotation.z=-.4,Se.rotation.x=.8;const rt=new f(ye,M);rt.position.y=-.12,rt.castShadow=!0,Se.add(rt);const Ne=new A;Ne.position.set(0,-.22,0),Ne.rotation.x=-1;const lt=new f(ve,L);lt.position.y=-.1,lt.castShadow=!0,Ne.add(lt);const St=new f(Qe,L);St.position.y=-.2,St.castShadow=!0,Ne.add(St),Se.add(Ne),W.add(Se),oe.add(W);const Je=new A;Je.position.set(-.08,.1,.1),Je.rotation.x=1.4;const Tt=new Ot(.055,.28,4,8),ct=new f(Tt,_);ct.position.y=-.16,ct.castShadow=!0,Je.add(ct);const je=new A;je.position.set(0,-.32,0),je.rotation.x=-1.8;const $t=new Ot(.045,.26,4,8),kt=new f($t,_);kt.position.y=-.15,kt.castShadow=!0,je.add(kt);const Ct=new k(.07,.04,.14),et=new f(Ct,U);et.position.set(0,-.3,.03),et.castShadow=!0,je.add(et),Je.add(je),oe.add(Je);const Te=new A;Te.position.set(.08,.1,-.05),Te.rotation.x=-.5;const Et=new f(Tt,_);Et.position.y=-.16,Et.castShadow=!0,Te.add(Et);const tt=new A;tt.position.set(0,-.32,0),tt.rotation.x=.3;const dt=new f($t,_);dt.position.y=-.15,dt.castShadow=!0,tt.add(dt);const ht=new f(Ct,U);return ht.position.set(0,-.3,.03),ht.rotation.x=.3,ht.castShadow=!0,tt.add(ht),Te.add(tt),oe.add(Te),e.add(oe),e}async preloadLevelModels(){this.gltfLoader=new Ut;const e={cubicle:"./models/cubicle.glb",quarter_pipe_small:"./models/qtr-pipe-small.glb",quarter_pipe_med:"./models/qtr-pipe-med.glb",quarter_pipe_large:"./models/qtr-pipe-lg.glb"};for(const[t,i]of Object.entries(e))try{const n=(await this.gltfLoader.loadAsync(i)).scene;n.traverse(o=>{o instanceof f&&(o.castShadow=!0,o.receiveShadow=!0)}),this.modelCache.set(t,n),console.log(`Loaded model: ${t}`)}catch(s){console.warn(`Failed to load model ${t} from ${i}:`,s)}}initEnvironment(){this.scene.background=new B(8900331);const t=new pe(500,32,32),i=new Hs({uniforms:{topColor:{value:new B(4886745)},bottomColor:{value:new B(16777215)},offset:{value:20},exponent:{value:.6}},vertexShader:`
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,side:Us}),s=new f(t,i);this.scene.add(s),this.levelObjects.push(s);const n=new oi(200,200,50,50),o=document.createElement("canvas");o.width=512,o.height=512;const a=o.getContext("2d");a.fillStyle="#555555",a.fillRect(0,0,512,512),a.strokeStyle="#666666",a.lineWidth=2;for(let C=0;C<=16;C++)a.beginPath(),a.moveTo(C*32,0),a.lineTo(C*32,512),a.stroke(),a.beginPath(),a.moveTo(0,C*32),a.lineTo(512,C*32),a.stroke();const r=new Gn(o);r.wrapS=me,r.wrapT=me,r.repeat.set(40,40);const l=new T({map:r,roughness:.9}),d=new f(n,l);d.rotation.x=-Math.PI/2,d.receiveShadow=!0,this.scene.add(d),this.levelObjects.push(d);const c=3,h=new T({color:8947848,roughness:.8}),u=200/2,y=new k(200,c,1),b=new f(y,h);b.position.set(0,c/2,u),this.scene.add(b),this.levelObjects.push(b);const w=new f(y,h);w.position.set(0,c/2,-u),this.scene.add(w),this.levelObjects.push(w);const x=new k(1,c,200),v=new f(x,h);v.position.set(u,c/2,0),this.scene.add(v),this.levelObjects.push(v);const S=new f(x,h);S.position.set(-u,c/2,0),this.scene.add(S),this.levelObjects.push(S),this.physics.createGround(u),this.createRails(),this.createRamps(),this.createFunBoxes()}createRails(){const e=new T({color:13421772,metalness:.8,roughness:.2});this.createRail(0,10,15,e),this.createRail(-8,5,10,e),this.createRail(8,5,10,e),this.createRailAngled(-12,20,8,Math.PI/6,e),this.createRailAngled(12,20,8,-Math.PI/6,e);const t=8;for(let i=0;i<t;i++){const s=i/t*Math.PI*.5,n=(i+1)/t*Math.PI*.5,o=12,a=-20+Math.cos(s)*o,r=-15+Math.sin(s)*o,l=(s+n)/2+Math.PI/2;this.createRailAngled(a,r,2,l,e)}}createRail(e,t,i,s){const n=new k(i,.08,.08),o=new f(n,s);o.position.set(e,.8,t),o.castShadow=!0,this.scene.add(o),this.levelObjects.push(o);const a=new O(.04,.04,.8),r=new T({color:6710886});for(let c=-1;c<=1;c+=2){const h=new f(a,r);h.position.set(e+c*(i/2-.2),.4,t),h.castShadow=!0,this.scene.add(h),this.levelObjects.push(h)}const l=new m(e-i/2,.8,t),d=new m(e+i/2,.8,t);this.grindSystem.addRail(l,d,`rail_${e}_${t}`,o)}createRailAngled(e,t,i,s,n){const o=new k(i,.08,.08),a=new f(o,n);a.position.set(e,.8,t),a.rotation.y=s,a.castShadow=!0,this.scene.add(a),this.levelObjects.push(a);const r=i/2,l=Math.cos(s)*r,d=Math.sin(s)*r,c=new m(e-l,.8,t-d),h=new m(e+l,.8,t+d);this.grindSystem.addRail(c,h,`rail_angled_${e}_${t}`,a)}createRamps(){const e=new T({color:9127187,roughness:.7});this.createRamp(-6,-8,Math.PI,e),this.createRamp(6,-8,Math.PI,e),this.createQuarterPipe(-25,0,Math.PI/2),this.createQuarterPipe(25,0,-Math.PI/2),this.createQuarterPipe(0,-30,0),this.createQuarterPipe(0,30,Math.PI)}createRamp(e,t,i,s){const n=new A,o=new k(4,.15,3),a=new f(o,s);a.position.set(0,.6,0),a.rotation.x=-Math.PI/8,a.castShadow=!0,a.receiveShadow=!0,n.add(a);const r=new k(.1,.8,3.2),l=new f(r,s);l.position.set(-2,.4,0),l.castShadow=!0,n.add(l);const d=new f(r,s);d.position.set(2,.4,0),d.castShadow=!0,n.add(d),n.position.set(e,0,t),n.rotation.y=i,this.scene.add(n),this.levelObjects.push(n);const c=new m(e,.5,t);this.physics.createStaticBox(c,new m(2.2,.2,1.8),new ne(-Math.PI/12,i,0))}createQuarterPipe(e,t,i){const s=new T({color:6710886,roughness:.6,side:Hi}),n=new Bt,o=4,a=16;n.moveTo(0,0);for(let c=0;c<=a;c++){const h=c/a*Math.PI/2;n.lineTo(o-Math.cos(h)*o,Math.sin(h)*o)}n.lineTo(o,0),n.lineTo(0,0);const r={steps:1,depth:10,bevelEnabled:!1},l=new Nt(n,r),d=new f(l,s);d.position.set(e,0,t),d.rotation.y=i,d.castShadow=!0,d.receiveShadow=!0,this.scene.add(d),this.levelObjects.push(d),this.physics.createStaticBox(new m(e,1.5,t),new m(5,1.5,5),new ne(0,i,0))}createFunBoxes(){const e=new T({color:4868682,roughness:.8}),t=new k(6,.8,4),i=new f(t,e);i.position.set(0,.4,-5),i.castShadow=!0,i.receiveShadow=!0,this.scene.add(i),this.levelObjects.push(i);const s=new T({color:13421772,metalness:.8,roughness:.2}),n=new k(6,.06,.06),o=new f(n,s);o.position.set(0,.85,-5-1.5),this.scene.add(o),this.levelObjects.push(o);const a=new f(n,s);a.position.set(0,.85,-5+1.5),this.scene.add(a),this.levelObjects.push(a),this.physics.createStaticBox(new m(0,.5,-5),new m(3.2,.5,2.2))}start(){this.isRunning=!0,this.isPaused=!1,this.lastTime=performance.now(),this.levelTime=0,J.startWheelRoll(),requestAnimationFrame(this.loop.bind(this))}pause(){this.isPaused=!0,J.updateWheelRoll(0,!1)}resume(){this.isPaused=!1,this.lastTime=performance.now()}async changePlayerSkin(e){this.playerModel&&(console.log(`Changing player skin to: ${e}`),await this.playerModel.changeSkin(e),this.animState="standing",this.isMounted=!1,this.updatePlayerMountPosition())}loadLevel(e){console.log(`Loading level: ${e}`);const t=ka(e);if(t){this.loadStoryLevel(t);return}const i=ja(e);if(!i){console.error(`Level not found: ${e}`);return}this.loadCustomLevel(i)}loadStoryLevel(e){console.log(`Loading story level: ${e.name}`),this.currentStoryLevel=e,this.checkpoints=e.checkpoints||[],this.lastCheckpointIndex=-1,this.checkpointPosition=null;const t=Ie.getCheckpoint(e.id);if(t>=0&&t<this.checkpoints.length){const i=this.checkpoints[t];this.lastCheckpointIndex=t,this.checkpointPosition=new m(i.position[0],i.position[1],i.position[2]),this.checkpointRotation=i.rotation*Math.PI/180}this.loadUpgradeEffects(),this.loadCustomLevel(e),this.checkpointPosition&&this.chairBody&&(this.physics.setPosition(this.chairBody,this.checkpointPosition),this.physics.setRotationY(this.chairBody,this.checkpointRotation)),e.hasChaseMechanic&&this.chaseMechanic?(this.chaseMechanic.start(e.chaseSpeed||8,50),this.chaseMechanic.createVisuals(this.scene),this.chaseHUD?.show()):(this.chaseMechanic?.stop(),this.chaseHUD?.hide()),this.spawnLevelNPCs(e.id),e.introDialogue&&e.introDialogue.length>0&&setTimeout(()=>{this.showIntroDialogue(e.introDialogue||[])},500),Ie.setCurrentLevel(e.id)}getCurrentLevelId(){return this.currentLevelId}loadCustomLevel(e){console.log(`Loading custom level: ${e.name}`),this.currentLevelId=e.id,this.levelTime=0,this.specialMeter=0,this.grindBalance=.5,this.manualBalance=.5,this.spinRotation=0,this.playerState={isGrounded:!0,isAirborne:!1,isGrinding:!1,isManualing:!1,hasSpecial:!1,airTime:0},this.isMounted=!1,this.animState="standing",this.updatePlayerMountPosition(),this.playerModel&&this.playerModel.play("idle"),this.comboSystem.reset(),this.clearLevelObjects();const t=e.skyColorTop||e.skyColor||"#1e90ff",i=e.skyColorBottom||e.skyColor||"#87ceeb";this.skyGradient.setColors(t,i);const s=e.ambientLight,n=e.sunIntensity;this.updateLightingForSky(t,i,s,n),this.scene.background=null,e.fogColor?this.scene.fog=new es(e.fogColor,e.fogNear||50,e.fogFar||200):this.scene.fog=null,this.loadLevelObjects(e.objects,e.groundSize,e.groundColor||"#555555");const o=e.spawnPoint;this.chairBody&&(this.physics.setPosition(this.chairBody,new m(o.position[0],o.position[1],o.position[2])),this.physics.setVelocity(this.chairBody,new m(0,0,0)),this.physics.setRotationY(this.chairBody,o.rotation*Math.PI/180)),this.hud?.reset()}updateLightingForSky(e,t,i,s){const n=new B(e),o=new B(t),a=n.getHSL({h:0,s:0,l:0}).l,r=o.getHSL({h:0,s:0,l:0}).l,l=(a+r)/2;this.hemiLight.color.copy(n).lerp(new B(16777215),.5),this.hemiLight.groundColor.copy(o).lerp(new B(8947848),.3),this.hemiLight.intensity=.6+l*.5;const d=n.getHSL({h:0,s:0,l:0}),c=d.h>.02&&d.h<.15;l<.2?(this.sunLight.color.setHex(11189213),this.sunLight.intensity=.6,this.fillLight.color.setHex(8952251),this.fillLight.intensity=.4,this.ambientLight.intensity=.5):c?(this.sunLight.color.setHex(16764040),this.sunLight.intensity=1.4,this.sunLight.position.set(80,30,50),this.fillLight.color.setHex(8956620),this.fillLight.intensity=.5,this.ambientLight.intensity=.6):(this.sunLight.color.setHex(16777215),this.sunLight.intensity=1.4+l*.4,this.sunLight.position.set(50,100,50),this.fillLight.color.setHex(16777215),this.fillLight.intensity=.5,this.ambientLight.intensity=.6+l*.3),this.ambientLight.color.copy(n).lerp(new B(16777215),.8),i!==void 0&&(this.ambientLight.intensity=i),s!==void 0&&(this.sunLight.intensity=s)}clearLevelObjects(){for(const e of this.levelObjects)this.scene.remove(e);this.levelObjects=[],this.grindSystem.clearRails(),this.physics.clearStaticBodies(),this.clearNPCOfficers()}clearNPCOfficers(){for(const e of this.npcOfficers)this.scene.remove(e.getGroup()),e.dispose();this.npcOfficers=[],this.officerCaughtCooldown=0}spawnLevelNPCs(e){e==="story_1_office"?this.spawnOfficeOfficers():(e==="story_6_forest"||e==="story_9_finale")&&this.spawnChaseOfficers()}spawnOfficeOfficers(){const e=[{position:new m(-25,0,-10),patrolPoints:[new m(-25,0,-30),new m(-25,0,5)]},{position:new m(25,0,-15),patrolPoints:[new m(25,0,-30),new m(25,0,5)]},{position:new m(0,0,-25),patrolPoints:[new m(-15,0,-25),new m(15,0,-25)]},{position:new m(0,0,5),patrolPoints:[new m(-10,0,5),new m(10,0,5)]}];for(const t of e){const i=new gs({position:t.position,patrolPoints:t.patrolPoints,detectionRange:15,chaseRange:25,catchRange:2,walkSpeed:3,runSpeed:6},{onCaught:()=>this.handleOfficerCaught()});this.npcOfficers.push(i),i.load(this.gltfLoader).then(s=>{this.scene.add(s),console.log("[Game] NPC officer spawned at",t.position)}).catch(s=>{console.warn("[Game] Failed to load NPC officer model:",s)})}}spawnChaseOfficers(){const e=this.currentStoryLevel?.spawnPoint.position;if(!e)return;const t=new m(e[0]-10,0,e[2]);for(let i=0;i<2;i++){const s=new m((i-.5)*4,0,0),n=new gs({position:t.clone().add(s),detectionRange:999,chaseRange:999,catchRange:2,walkSpeed:4,runSpeed:8},{onCaught:()=>this.handleOfficerCaught()});n.startChase(),this.npcOfficers.push(n),n.load(this.gltfLoader).then(o=>{this.scene.add(o),console.log("[Game] Chase NPC officer spawned")}).catch(o=>{console.warn("[Game] Failed to load chase NPC officer:",o)})}}handleOfficerCaught(){if(this.officerCaughtCooldown>0)return;this.officerCaughtCooldown=3,console.log("[Game] Player caught by officer NPC!"),this.onOfficerCaught?.(),this.cameraController.shake(1.2,.5);const e=500;this.totalStonks=Math.max(0,this.totalStonks-e),this.hud?.setScore(Math.floor(this.totalStonks)),this.dialogueBox&&this.dialogueBox.show(["SEC OFFICER: Gotcha! ...wait, he's still going?!"]),this.lastCheckpointIndex>=0&&this.checkpointPosition&&this.restoreCheckpoint()}loadLevelObjects(e,t,i="#555555"){this.createLevelGround(t,i);const s=new Set(["shrub_small","shrub_medium","shrub_large","tree_small","cone","trash_can","planter"]),n=new Map,o=[];for(const a of e)s.has(a.type)?(n.has(a.type)||n.set(a.type,[]),n.get(a.type).push(a)):o.push(a);for(const[a,r]of n)r.length>0&&this.createInstancedObjects(a,r);for(const a of o){const r=this.createLevelObject(a);r&&(this.scene.add(r),this.levelObjects.push(r))}}createInstancedObjects(e,t){const i=this.getInstanceTemplate(e);if(!i)return;const{geometry:s,material:n}=i,o=new Ps(s,n,t.length);o.castShadow=!0,o.receiveShadow=!0;const a=new N,r=new m,l=new ne,d=new G,c=new m(1,1,1);t.forEach((h,u)=>{r.set(h.position[0],h.position[1]||0,h.position[2]),h.rotation?(l.set(R.degToRad(h.rotation[0]||0),R.degToRad(h.rotation[1]||0),R.degToRad(h.rotation[2]||0)),d.setFromEuler(l)):d.identity(),a.compose(r,d,c),o.setMatrixAt(u,a),this.createInstancePhysics(e,h)}),o.instanceMatrix.needsUpdate=!0,this.scene.add(o),this.levelObjects.push(o)}getInstanceTemplate(e){switch(e){case"shrub_small":{const t=new pe(.5,8,6),i=new T({color:2263842,roughness:.9});return{geometry:t,material:i}}case"shrub_medium":{const t=new pe(.8,8,6),i=new T({color:2263842,roughness:.9});return{geometry:t,material:i}}case"shrub_large":{const t=new pe(1.2,8,6),i=new T({color:2263842,roughness:.9});return{geometry:t,material:i}}case"tree_small":{const t=new at(1.5,3,8);t.translate(0,3.5,0);const i=new T({color:2263842,roughness:.9});return{geometry:t,material:i}}case"cone":{const t=new at(.3,.7,8);t.translate(0,.35,0);const i=new T({color:16737792,roughness:.8});return{geometry:t,material:i}}case"trash_can":{const t=new O(.3,.25,.8,8);t.translate(0,.4,0);const i=new T({color:4473924,roughness:.6,metalness:.4});return{geometry:t,material:i}}case"planter":{const t=new k(1.5,1.2,1.5);t.translate(0,.6,0);const i=new T({color:6710886,roughness:.9});return{geometry:t,material:i}}default:return null}}createInstancePhysics(e,t){const i=new m(t.position[0],0,t.position[2]);switch(e){case"shrub_small":this.physics.createStaticBox(i.clone().setY(.3),new m(.25,.3,.25));break;case"shrub_medium":this.physics.createStaticBox(i.clone().setY(.5),new m(.4,.5,.4));break;case"shrub_large":this.physics.createStaticBox(i.clone().setY(.75),new m(.6,.75,.6));break;case"tree_small":this.physics.createStaticBox(i.clone().setY(2.5),new m(1,.5,1));break;case"cone":this.physics.createStaticBox(i.clone().setY(.25),new m(.15,.25,.15));break;case"trash_can":this.physics.createStaticBox(i.clone().setY(.4),new m(.2,.4,.2));break;case"planter":this.physics.createStaticBox(i.clone().setY(.75),new m(.75,.75,.75));break}}createLevelGround(e,t="#555555"){const i=new oi(e,e),s=new T({color:t,roughness:.9,metalness:.1}),n=new f(i,s);n.rotation.x=-Math.PI/2,n.receiveShadow=!0,this.scene.add(n),this.levelObjects.push(n),this.physics.createGround(e/2)}createLevelObject(e){let t=null;const i=new T({color:13421772,metalness:.8,roughness:.2}),s=new T({color:9127187,roughness:.7}),n=new T({color:6710886,roughness:.9}),o=new T({color:8947848,metalness:.6,roughness:.4}),a=new T({color:4868702,roughness:.7});switch(e.type){case"rail":case"rail_angled":case"rail_curved":{const d=e.params?.length||10;t=this.createRailMesh(d,i,o);const h=(e.rotation?.[1]||0)*Math.PI/180,u=d/2,y=Math.cos(h)*u,b=Math.sin(h)*u,w=new m(e.position[0]-y,.8,e.position[2]-b),x=new m(e.position[0]+y,.8,e.position[2]+b);this.grindSystem.addRail(w,x,`rail_${e.position[0]}_${e.position[2]}`,t);break}case"ramp":t=this.createRampMesh(s);const r=e.rotation?.[1]||0;this.physics.createStaticBox(new m(e.position[0],.5,e.position[2]),new m(2.2,.2,1.8),new ne(-Math.PI/12,r*Math.PI/180,0));break;case"quarter_pipe":case"quarter_pipe_small":case"quarter_pipe_med":case"quarter_pipe_large":{const d=e.type==="quarter_pipe"?"quarter_pipe_med":e.type,c=this.modelCache.get(d);c?t=c.clone():t=this.createQuarterPipeMesh(n);const h=e.type==="quarter_pipe_small"?3:e.type==="quarter_pipe_large"?7:5;this.physics.createStaticBox(new m(e.position[0],h/3,e.position[2]),new m(h,h/2,h),new ne(0,(e.rotation?.[1]||0)*Math.PI/180,0));break}case"half_pipe":{const d=e.params?.width||15,c=e.params?.length||20;t=this.createHalfPipeMesh(n,d,c);break}case"fun_box":{const d=e.params?.width||6,c=e.params?.depth||4,h=e.params?.height||.8;t=this.createFunBoxMesh(n,i,d,c,h),this.physics.createStaticBox(new m(e.position[0],h/2,e.position[2]),new m(d/2,h/2,c/2));break}case"stairs":{const d=e.params?.steps||5;t=this.createStairsMesh(n,d);const c=d*.25,h=d*.3;this.physics.createStaticBox(new m(e.position[0],c/2,e.position[2]),new m(1.5,c/2,h/2));break}case"cubicle":{const d=e.params?.width||3,c=e.params?.depth||3,h=e.params?.height||1.5,u=this.modelCache.get("cubicle");u?t=u.clone():t=this.createCubicleMesh(a,s,d,c,h),this.physics.createStaticBox(new m(e.position[0],h/2,e.position[2]),new m(d/2,h/2,c/2));break}case"car":t=this.createCarMesh(),this.physics.createStaticBox(new m(e.position[0],.75,e.position[2]),new m(2,.75,1));break;case"bench":t=this.createBenchMesh(s,o),this.physics.createStaticBox(new m(e.position[0],.3,e.position[2]),new m(1,.3,.25));break;case"planter":t=this.createPlanterMesh(n),this.physics.createStaticBox(new m(e.position[0],.75,e.position[2]),new m(.75,.75,.75));break;case"water_cooler":t=this.createWaterCoolerMesh(),this.physics.createStaticBox(new m(e.position[0],.6,e.position[2]),new m(.2,.6,.2));break;case"trash_can":t=this.createTrashCanMesh(o),this.physics.createStaticBox(new m(e.position[0],.4,e.position[2]),new m(.2,.4,.2));break;case"cone":t=this.createConeMesh(),this.physics.createStaticBox(new m(e.position[0],.25,e.position[2]),new m(.15,.25,.15));break;case"barrier":{const d=e.params?.length||5;t=this.createBarrierMesh(o,d),this.physics.createStaticBox(new m(e.position[0],.5,e.position[2]),new m(d/2,.4,.05));break}case"building_small":case"building_medium":case"building_large":case"building_wide":{const d={building_small:{width:10,depth:10,height:15},building_medium:{width:15,depth:15,height:30},building_large:{width:20,depth:20,height:50},building_wide:{width:30,depth:15,height:12}},c=d[e.type]||d.building_small,h=e.params?.width||c.width,u=e.params?.depth||c.depth,y=e.params?.height||c.height;t=this.createBuildingMesh(e.type,e.params),this.physics.createStaticBox(new m(e.position[0],y/2,e.position[2]),new m(h/2,y/2,u/2));break}case"shrub_small":t=this.createShrubMesh(.5,.6),this.physics.createStaticBox(new m(e.position[0],.3,e.position[2]),new m(.25,.3,.25));break;case"shrub_medium":t=this.createShrubMesh(.8,1),this.physics.createStaticBox(new m(e.position[0],.5,e.position[2]),new m(.4,.5,.4));break;case"shrub_large":t=this.createShrubMesh(1.2,1.5),this.physics.createStaticBox(new m(e.position[0],.75,e.position[2]),new m(.6,.75,.6));break;case"tree_small":t=this.createTreeMesh(),this.physics.createStaticBox(new m(e.position[0],2.5,e.position[2]),new m(1,.5,1));break;case"wall_indoor":{const d=e.params?.width||10,c=e.params?.height||8,h=e.params?.depth||1;t=this.createIndoorWallMesh(d,c,h);const u=e.rotation?new ne(e.rotation[0]*Math.PI/180,e.rotation[1]*Math.PI/180,e.rotation[2]*Math.PI/180):new ne(0,0,0);this.physics.createStaticBox(new m(e.position[0],e.position[1],e.position[2]),new m(d/2,c/2,h/2),u);break}case"ceiling_slab":{const d=e.params?.width||80,c=e.params?.depth||80;t=this.createCeilingSlabMesh(d,c),this.physics.createStaticBox(new m(e.position[0],e.position[1],e.position[2]),new m(d/2,.5,c/2));break}case"ceiling_panel":{const d=e.params?.width||6,c=e.params?.depth||.8;t=this.createCeilingPanelMesh(d,c);const h=new zt(16772829,1.8,22);h.position.set(e.position[0],e.position[1]-2,e.position[2]),this.scene.add(h),this.levelObjects.push(h);break}case"filing_cabinet":{t=this.createFilingCabinetMesh(),this.physics.createStaticBox(new m(e.position[0],.9,e.position[2]),new m(.4,.9,.3));break}case"printer":{t=this.createPrinterMesh(),this.physics.createStaticBox(new m(e.position[0],.35,e.position[2]),new m(.35,.35,.3));break}case"exit_sign":{const d=e.params?.width||3,c=e.params?.height||.8;t=this.createExitSignMesh(d,c);break}default:const l=new k(1,1,1);t=new f(l,n)}return t&&(t.position.set(e.position[0],e.position[1],e.position[2]),e.rotation&&t.rotation.set(e.rotation[0]*Math.PI/180,e.rotation[1]*Math.PI/180,e.rotation[2]*Math.PI/180)),t}createRailMesh(e,t,i){const s=new A,n=new k(e,.08,.08),o=new f(n,t);o.position.y=.8,o.castShadow=!0,s.add(o);const a=new O(.04,.04,.8);for(const r of[-1,1]){const l=new f(a,i);l.position.set(r*(e/2-.2),.4,0),l.castShadow=!0,s.add(l)}return s}createRampMesh(e){const t=new A,i=new k(4,.15,3),s=new f(i,e);s.position.set(0,.6,0),s.rotation.x=-Math.PI/8,s.castShadow=!0,t.add(s);const n=new k(.1,.8,3.2);for(const o of[-1,1]){const a=new f(n,e);a.position.set(o*2,.4,0),t.add(a)}return t}createQuarterPipeMesh(e){const t=new Bt,i=4,s=16;t.moveTo(0,0);for(let a=0;a<=s;a++){const r=a/s*Math.PI/2;t.lineTo(i-Math.cos(r)*i,Math.sin(r)*i)}t.lineTo(i,0),t.lineTo(0,0);const n=new Nt(t,{steps:1,depth:10,bevelEnabled:!1}),o=new f(n,e);return o.castShadow=!0,o.receiveShadow=!0,o}createHalfPipeMesh(e,t,i){const s=new A,n=new Bt,o=4,a=16;n.moveTo(0,0);for(let u=0;u<=a;u++){const y=u/a*Math.PI/2;n.lineTo(o-Math.cos(y)*o,Math.sin(y)*o)}n.lineTo(o,0),n.lineTo(0,0);const r=new Nt(n,{steps:1,depth:i,bevelEnabled:!1}),l=new f(r,e);l.position.set(-t/2,0,-i/2),l.rotation.y=Math.PI/2,s.add(l);const d=new f(r,e);d.position.set(t/2,0,i/2),d.rotation.y=-Math.PI/2,s.add(d);const c=new k(t-8,.1,i),h=new f(c,e);return h.position.set(0,.05,0),s.add(h),s}createFunBoxMesh(e,t,i,s,n){const o=new A,a=new k(i,n,s),r=new f(a,e);r.position.y=n/2,r.castShadow=!0,o.add(r);const l=new k(i,.06,.06);for(const d of[-1,1]){const c=new f(l,t);c.position.set(0,n+.03,d*(s/2-.03)),o.add(c)}return o}createStairsMesh(e,t){const i=new A,s=4,n=.2,o=.3;for(let a=0;a<t;a++){const r=new k(s,n,o),l=new f(r,e);l.position.set(0,n/2+a*n,a*o),l.castShadow=!0,i.add(l)}return i}createCubicleMesh(e,t,i,s,n=1.5){const o=new A,a=new T({color:3817296,roughness:.95,metalness:0}),r=new k(i,n,.08),l=new f(r,a);l.position.set(0,n/2,s/2),l.castShadow=!0,l.receiveShadow=!0,o.add(l);const d=new k(.08,n,s);for(const P of[-1,1]){const L=new f(d,a);L.position.set(P*i/2,n/2,0),L.castShadow=!0,L.receiveShadow=!0,o.add(L)}const c=new k(i*.85,.06,s*.42),h=new f(c,t);h.position.set(0,.76,s*.2),h.castShadow=!0,h.receiveShadow=!0,o.add(h);const u=new T({color:6710886,metalness:.7,roughness:.4}),y=new k(.06,.76,.06);for(const P of[-1,1])for(const L of[-1,1]){const M=new f(y,u);M.position.set(P*(i*.38),.38,s*.2+L*(s*.18)),o.add(M)}const b=new T({color:2236962,roughness:.6}),w=new T({color:1122867,emissive:662058,emissiveIntensity:.4}),x=new k(.5,.35,.04),v=new f(x,w);v.position.set(0,1.1,s*.35),o.add(v);const S=new k(.15,.22,.08),C=new f(S,b);return C.position.set(0,.87,s*.35),o.add(C),o}createCarMesh(){const e=new A,t=new T({color:2245802,metalness:.8,roughness:.3}),i=new T({color:2236962}),s=new k(2,1,4),n=new f(s,t);n.position.y=.8,n.castShadow=!0,e.add(n);const o=new k(1.5,.6,2),a=new f(o,t);a.position.set(0,1.6,-.3),e.add(a);const r=new O(.3,.3,.15,12),l=[[-.9,.3,1.3],[.9,.3,1.3],[-.9,.3,-1.3],[.9,.3,-1.3]];for(const[d,c,h]of l){const u=new f(r,i);u.position.set(d,c,h),u.rotation.z=Math.PI/2,e.add(u)}return e}createBenchMesh(e,t){const i=new A,s=new k(2,.1,.5),n=new f(s,e);n.position.y=.5,i.add(n);const o=new k(.1,.5,.4);for(const a of[-.8,.8]){const r=new f(o,t);r.position.set(a,.25,0),i.add(r)}return i}createPlanterMesh(e){const t=new A,i=new k(2,.8,2),s=new f(i,e);s.position.y=.4,t.add(s);const n=new O(.1,.15,1),o=new T({color:4861984}),a=new f(n,o);a.position.y=1.3,t.add(a);const r=new pe(.6,8,8),l=new T({color:2263842}),d=new f(r,l);return d.position.y=2,t.add(d),t}createWaterCoolerMesh(){const e=new A,t=new O(.2,.25,1,12),i=new T({color:6719658}),s=new f(t,i);s.position.y=.5,e.add(s);const n=new O(.15,.18,.4,12),o=new T({color:8965375,transparent:!0,opacity:.6}),a=new f(n,o);return a.position.y=1.2,e.add(a),e}createTrashCanMesh(e){const t=new O(.25,.2,.6,12),i=new f(t,e);return i.position.y=.3,i}createConeMesh(){const e=new at(.2,.5,8),t=new T({color:16737792}),i=new f(e,t);return i.position.y=.25,i}createBarrierMesh(e,t){const i=new A,s=new k(t,.8,.1),n=new T({color:16763904}),o=new f(s,n);o.position.y=.5,i.add(o);const a=new O(.05,.05,.8);for(const r of[-1,1]){const l=new f(a,e);l.position.set(r*(t/2-.1),.4,0),i.add(l)}return i}createBuildingMesh(e,t){const i=new A,s={building_small:{width:10,depth:10,height:15},building_medium:{width:15,depth:15,height:30},building_large:{width:20,depth:20,height:50},building_wide:{width:30,depth:15,height:12}},n=s[e]||s.building_small,o=t?.width||n.width,a=t?.depth||n.depth,r=t?.height||n.height,l=new T({color:8421520,roughness:.7,metalness:.1}),d=new k(o,r,a),c=new f(d,l);c.position.y=r/2,c.castShadow=!0,c.receiveShadow=!0,i.add(c);const h=new T({color:4491434,roughness:.1,metalness:.8}),u=Math.floor(r/3),y=Math.floor(o/3);for(let b=0;b<u;b++)for(let w=0;w<y;w++){const x=new k(1.5,2,.1),v=new f(x,h);v.position.set(-o/2+1.5+w*3,2+b*3,a/2+.05),i.add(v);const S=v.clone();S.position.z=-a/2-.05,i.add(S)}return i}createShrubMesh(e,t){const i=new A,s=new T({color:2263091,roughness:.8}),n=5;for(let o=0;o<n;o++){const a=e*(.6+Math.random()*.4),r=new pe(a,8,6),l=new f(r,s);l.position.set((Math.random()-.5)*e,t*.5+(Math.random()-.5)*t*.3,(Math.random()-.5)*e),l.castShadow=!0,i.add(l)}return i}createTreeMesh(){const e=new A,t=new T({color:4863784,roughness:.9}),i=new O(.15,.2,2,8),s=new f(i,t);s.position.y=1,s.castShadow=!0,e.add(s);const n=new T({color:2972199,roughness:.8}),o=new at(1.5,3,8),a=new f(o,n);return a.position.y=3.5,a.castShadow=!0,e.add(a),e}createIndoorWallMesh(e,t,i){const s=new k(e,t,i),n=new T({color:13946824,roughness:.85,metalness:0}),o=new f(s,n);return o.castShadow=!1,o.receiveShadow=!0,o}createCeilingSlabMesh(e,t){const i=new k(e,1,t),s=new T({color:14211280,roughness:.9,metalness:0}),n=new f(i,s);return n.receiveShadow=!0,n}createCeilingPanelMesh(e,t){const i=new A,s=new T({color:13421772,roughness:.4,metalness:.5}),n=new k(e+.1,.08,t+.1),o=new f(n,s);o.position.y=0,i.add(o);const a=new T({color:16777215,emissive:16772829,emissiveIntensity:1.8,roughness:.1}),r=new k(e-.15,.06,t-.05),l=new f(r,a);return l.position.y=-.02,i.add(l),i}createFilingCabinetMesh(){const e=new A,t=new T({color:8421504,roughness:.6,metalness:.5}),i=new T({color:10066329,roughness:.3,metalness:.8}),s=new k(.8,1.8,.6),n=new f(s,t);n.position.y=.9,n.castShadow=!0,n.receiveShadow=!0,e.add(n);const o=new k(.3,.04,.05);for(let l=0;l<3;l++){const d=new f(o,i);d.position.set(0,.4+l*.5,.33),e.add(d)}const a=new k(.78,.01,.59),r=new T({color:5592405});for(let l=0;l<3;l++){const d=new f(a,r);d.position.set(0,.15+l*.5,0),e.add(d)}return e}createPrinterMesh(){const e=new A,t=new T({color:2763306,roughness:.7,metalness:.1}),i=new T({color:5592405,roughness:.6}),s=new T({color:1122867,emissive:4386,emissiveIntensity:.5}),n=new k(.7,.5,.6),o=new f(n,t);o.position.y=.4,o.castShadow=!0,o.receiveShadow=!0,e.add(o);const a=new k(.65,.06,.35),r=new f(a,i);r.position.set(0,.18,.15),e.add(r);const l=new k(.2,.12,.02),d=new f(l,s);return d.position.set(-.2,.62,.3),e.add(d),e}createExitSignMesh(e,t){const i=new A,s=new T({color:8704}),n=new k(e,t,.05),o=new f(n,s);o.position.y=0,i.add(o);const a=new T({color:65348,emissive:52275,emissiveIntensity:3,roughness:.2}),r=new k(e-.1,t-.08,.04),l=new f(r,a);l.position.z=.03,i.add(l);const d=new zt(65382,2,6);return d.position.set(0,0,.3),i.add(d),i}stop(){this.isRunning=!1,J.stopWheelRoll()}loop(e){if(!this.isRunning)return;const t=(e-this.lastTime)/1e3;if(this.lastTime=e,!this.isPaused){this.accumulator+=t,this.levelTime+=t;let i=0;for(;this.accumulator>=this.PHYSICS_TIMESTEP&&i<this.MAX_FRAME_SKIP;)this.fixedUpdate(this.PHYSICS_TIMESTEP),this.accumulator-=this.PHYSICS_TIMESTEP,i++;this.hud&&this.hud.update(t)}this.skyGradient&&this.camera&&this.skyGradient.update(this.camera.position),this.render(),requestAnimationFrame(this.loop.bind(this))}fixedUpdate(e){this.input.update();const t=this.input.getState();(t.forward||t.brake||t.turnLeft||t.turnRight||t.jump||t.flip||t.grab||t.grind)&&this.hud?.hideControlsHint(),this.updatePlayerState(e);const i=this.trickDetector.detectTrick(t,this.playerState),s=performance.now(),n=s-this.lastTrickTime<200;i&&n&&!this.queuedTrick&&(this.queuedTrick=i);const o=n?null:this.queuedTrick||i;if(o){this.comboSystem.addTrick(o),this.lastTrickTime=s,this.queuedTrick=null,J.playTrick(o.basePoints);const c=this.specialMeter;this.specialMeter=Math.min(1,this.specialMeter+o.basePoints/5e3),this.hud?.setSpecial(this.specialMeter),c<1&&this.specialMeter>=1&&J.playSpecialReady()}if(this.playerState.isAirborne||(this.queuedTrick=null),this.grindSystem.updateCooldown(e),!this.grindSystem.isGrinding()){const c=this.physics.getPosition(this.chairBody),h=this.physics.getVelocity(this.chairBody);if(this.grindSystem.tryStartGrind(c,h,!0)){this.playerState.isGrinding=!0,this.grindBalance=.5,this.grindScore=0,J.playGrindStart(),J.startGrindLoop(),J.startBalanceWarning();const y=this.grindSystem.getState();y.rail&&this.cameraController.setGrindCamera(!0,y.rail.start,y.rail.end)}}if(this.grindSystem.isGrinding()){let c=0;if(t.turnLeft&&(c=-1),t.turnRight&&(c=1),t.jump)this.grindSystem.forceEndGrind(),this.playerState.isGrinding=!1,J.stopGrindLoop(),J.stopBalanceWarning(),J.playJump(),this.physics.applyImpulse(this.chairBody,new m(0,10,0)),this.cameraController.setGrindCamera(!1);else{this.grindSystem.updateGrind(e,c,this.physics,this.chairBody,this.grindBalanceDrift*2);const h=this.grindSystem.getState();this.grindBalance=h.balance,J.updateBalanceWarning(this.grindBalance);const u=1+Math.abs(.5-h.balance)*-4+2,y=10*Math.max(1,u);if(this.grindScore+=y*e,this.totalStonks+=y*e,this.hud?.setScore(Math.floor(this.totalStonks)),h.rail){const b=new m().lerpVectors(h.rail.start,h.rail.end,h.progress);b.y+=.1,this.grindParticles.update(e,!0,b,h.rail.direction)}this.grindSystem.isGrinding()||(this.playerState.isGrinding=!1,J.stopGrindLoop(),J.stopBalanceWarning(),this.cameraController.setGrindCamera(!1))}}else this.applyMovement(t,e),this.grindParticles.update(e,!1);this.landingParticles.update(e),this.grindSystem.isGrinding()||this.physics.step(e);const a=this.physics.getPosition(this.chairBody),r=this.physics.getRotation(this.chairBody);this.chair.position.copy(a),this.chair.quaternion.copy(r),this.playerState.isAirborne&&this.spinRotation!==0&&(this.chair.rotation.y+=this.spinRotation*e),this.cameraController.update(e);const l=this.physics.getVelocity(this.chairBody),d=new m(l.x,0,l.z).length();if(J.updateWheelRoll(d,this.playerState.isGrounded&&!this.playerState.isGrinding),this.wheelMeshes.length>0&&this.playerState.isGrounded&&!this.playerState.isGrinding){const h=d/.025*e;for(const u of this.wheelMeshes)u.rotation.x+=h}if(this.speedLines.update(e,d,this.playerState.isGrounded),this.hud?.setSpeed(d),this.cameraController.updateFOVFromSpeed(d,18),this.cameraController.setTrickZoom(this.playerState.isAirborne,this.playerState.airTime),this.comboSystem.update(e),this.hud&&this.comboSystem.hasActiveCombo()){const c=this.comboSystem.getState();this.hud.updateComboTimer(c.timeRemaining,2e3)}this.playerState.isGrinding||this.playerState.isManualing?(this.hud?.setBalanceVisible(!0),this.hud?.setBalance(this.playerState.isGrinding?this.grindBalance:this.manualBalance)):this.hud?.setBalanceVisible(!1),this.playerModel&&this.useGLBModel&&(this.playerModel.update(e),this.updatePlayerAnimation(t)),this.updateStorySystems(e),this.input.clearJustPressed()}updateStorySystems(e){if(this.levelTime+=e,this.updateCheckpoints(),this.chaseMechanic?.isChaseActive()){const t=this.physics.getVelocity(this.chairBody),i=new m(t.x,0,t.z).length();this.chaseMechanic.update(e,i,this.chair.position),this.chaseMechanic.updateVisuals(this.chair.position,this.chair.rotation.y),this.chaseHUD&&this.chaseHUD.update(this.chaseMechanic.getState())}if(this.npcOfficers.length>0){this.officerCaughtCooldown>0&&(this.officerCaughtCooldown-=e);const t=this.chair.position;for(const i of this.npcOfficers)i.update(e,t)}}animState="standing";stateStartTime=0;isMounted=!1;updatePlayerAnimation(e){if(!this.playerModel||this.isDebugAnimLocked())return;const t=this.physics.getVelocity(this.chairBody),i=new m(t.x,0,t.z).length(),s=performance.now();if(this.animState!=="crash"){if(this.animState==="recovering"){s-this.stateStartTime>1e3&&(this.animState="standing",this.isMounted=!1,this.updatePlayerMountPosition(),this.playerModel.play("idle",{loop:!0}));return}if(this.animState==="standing"){if(!this.isMounted){if(this.updatePlayerMountPosition(),e.forward){this.animState="running",this.stateStartTime=s,this.playerModel.play("push",{loop:!0});return}this.playerModel.isPlaying("idle")||this.playerModel.play("idle",{loop:!0})}return}if(this.animState==="running"){if(s-this.stateStartTime>400){this.animState="mounting",this.stateStartTime=s,this.playerModel.play("standtosit",{loop:!1});return}return}if(this.animState==="mounting"){s-this.stateStartTime>500&&(this.isMounted=!0,this.updatePlayerMountPosition(),this.animState="pushing",this.stateStartTime=s,this.playerModel.playOnce("push","rolling"));return}if(this.playerState.isAirborne&&this.isMounted){e.flip||e.grab?(e.flip?!this.playerModel.isPlaying("trick")&&!this.playerModel.isPlaying("roll")&&this.playerModel.play("trick",{loop:!1}):e.grab&&(this.playerModel.isPlaying("chairhold")||this.playerModel.play("chairhold",{loop:!0})),this.animState="trick"):(!this.playerModel.isPlaying("jump")&&this.animState!=="trick"&&this.playerModel.play("jump",{loop:!1}),this.animState="air");return}if(this.isMounted){if(this.animState==="pushing"){s-this.stateStartTime>600&&(this.animState="rolling",this.stateStartTime=s,this.playerModel.play("rolling",{loop:!0}));return}(this.animState==="rolling"||this.animState==="air"||this.animState==="trick")&&(!this.playerModel.isPlaying("rolling")&&this.playerState.isGrounded&&(this.playerModel.play("rolling",{loop:!0}),this.animState="rolling"),e.forward&&i<8&&this.playerState.isGrounded&&(this.playerModel.playOnce("push","rolling"),this.animState="pushing",this.stateStartTime=s),i<.3&&this.playerState.isGrounded&&this.playerModel.play("rolling",{loop:!0}))}}}updatePlayerMountPosition(){this.playerModel&&(this.isMounted?this.playerModel.setLocalPosition(-.2,-.4,0):this.playerModel.setLocalPosition(0,0,-1.2))}triggerCrash(){this.playerModel&&(this.animState="crash",this.stateStartTime=performance.now(),this.playerModel.play("crash",{loop:!1}),setTimeout(()=>{this.animState==="crash"&&(this.animState="recovering",this.stateStartTime=performance.now(),this.isMounted=!1,this.updatePlayerMountPosition(),this.physics.setVelocity(this.chairBody,new m(0,0,0)))},1500))}isPlayerMounted(){return this.isMounted}updatePlayerState(e){const t=this.physics.getPosition(this.chairBody),i=this.physics.getVelocity(this.chairBody),s=this.playerState.isGrounded,n=this.physics.raycastGroundMulti(t,.3,this.GROUND_SNAP_DISTANCE);if(n&&n.distance<this.GROUND_SNAP_DISTANCE){this.surfaceNormal.copy(n.normal),this.surfaceAngle=n.surfaceAngle;const o=n.distance<.9,a=i.y<5;if(this.surfaceAngle>this.LAUNCH_ANGLE?i.y>2&&this.surfaceAngle>60?this.playerState.isGrounded=!1:this.playerState.isGrounded=o&&a:this.playerState.isGrounded=o&&a,this.playerState.isGrounded&&n.distance>.5&&n.distance<.85){const r=(.8-n.distance)*15,l=i.clone();l.y-=r,this.physics.setVelocity(this.chairBody,l)}}else this.playerState.isGrounded=!1,this.surfaceNormal.set(0,1,0),this.surfaceAngle=0;if(this.playerState.isAirborne=!this.playerState.isGrounded,this.playerState.isGrounded&&(this.lastGroundedTime=performance.now()),this.playerState.isAirborne){this.playerState.airTime+=e*1e3;const a=(this.chair.rotation.y-this.airStartRotation)*(180/Math.PI);this.cumulativeSpinDegrees=Math.abs(a);const r=Math.floor(this.cumulativeSpinDegrees/180)*180;this.hud?.setSpinCounter(r>=180?r:0)}else this.playerState.airTime=0;if(s&&!this.playerState.isGrounded&&(this.airStartRotation=this.chair.rotation.y,this.cumulativeSpinDegrees=0),!s&&this.playerState.isGrounded){J.playLand();const o=Math.min(1,this.playerState.airTime/1500);o>.1&&this.landingParticles.spawn(t.clone(),o);let a=Math.min(.3,this.playerState.airTime/2e3);if(this.comboSystem.hasActiveCombo()){const r=this.comboSystem.getState();a=Math.min(.5,a+r.multiplier*.05),this.comboSystem.land()}a>.05&&this.cameraController.shake(a,.2),this.spinRotation=0,this.cumulativeSpinDegrees=0,this.hud?.setSpinCounter(0)}this.playerState.hasSpecial=this.specialMeter>=1,this.playerState.hasSpecial&&(this.specialMeter=Math.max(0,this.specialMeter-e*.1),this.hud?.setSpecial(this.specialMeter))}applyMovement(e,t){if(!this.isMounted){e.turnLeft?this.physics.setAngularVelocity(this.chairBody,new m(0,1.5,0)):e.turnRight?this.physics.setAngularVelocity(this.chairBody,new m(0,-1.5,0)):this.physics.setAngularVelocity(this.chairBody,new m(0,0,0));return}const i=.4*this.speedMultiplier,s=10*this.jumpMultiplier,n=6*this.spinMultiplier,o=18*this.speedMultiplier,a=this.physics.getRotation(this.chairBody),r=new m(0,0,1).applyQuaternion(a),l=this.physics.getVelocity(this.chairBody),d=new m(l.x,0,l.z).length(),c=this.physics.getSurfaceMovementDirection(r,this.surfaceNormal);if(e.forward&&this.playerState.isGrounded&&d<o){const x=c.clone().multiplyScalar(i),v=l.clone();v.x+=x.x,v.y+=x.y,v.z+=x.z,this.physics.setVelocity(this.chairBody,v);const S=performance.now();S-this.lastPushSoundTime>400&&(J.playPush(),this.lastPushSoundTime=S)}if(e.brake&&this.playerState.isGrounded&&d<o){const x=c.clone().multiplyScalar(-i*.6),v=l.clone();v.x+=x.x,v.y+=x.y,v.z+=x.z,this.physics.setVelocity(this.chairBody,v)}if(this.playerState.isGrounded&&this.surfaceAngle>20){const x=Math.min(.8,this.surfaceAngle/60),v=l.clone();v.y+=x*.3,this.physics.setVelocity(this.chairBody,v)}const h=4.5,u=3.5;if(e.turnLeft){const x=this.playerState.isGrounded?h:u;this.physics.setAngularVelocity(this.chairBody,new m(0,x,0))}else if(e.turnRight){const x=this.playerState.isGrounded?h:u;this.physics.setAngularVelocity(this.chairBody,new m(0,-x,0))}else this.physics.setAngularVelocity(this.chairBody,new m(0,0,0));const y=performance.now()-this.lastGroundedTime<this.COYOTE_TIME_MS,b=this.playerState.isGrounded||y;if((e.jump||this.input.isJumpBuffered())&&b){J.playJump(),this.input.clearJumpBuffer(),this.lastGroundedTime=0;const x=l.clone();x.y=s,x.x+=r.x*2,x.z+=r.z*2,this.physics.setVelocity(this.chairBody,x)}this.playerState.isAirborne&&(e.spinLeft?(this.spinRotation=n,this.physics.applyTorque(this.chairBody,new m(0,n,0))):e.spinRight?(this.spinRotation=-n,this.physics.applyTorque(this.chairBody,new m(0,-n,0))):this.spinRotation=0)}render(e){this.renderer.render(this.scene,this.camera)}onResize(){const e=window.innerWidth,t=window.innerHeight;this.camera.aspect=e/t,this.camera.updateProjectionMatrix(),this.renderer.setSize(e,t)}debugCycleAnimation(e){if(!this.playerModel)return;const t=["idle","push","standtosit","rolling","chairhold","trick","jump","roll","slide","crash"];this.debugAnimIndex=(this.debugAnimIndex+e+t.length)%t.length;const i=t[this.debugAnimIndex];console.log(`🎬 DEBUG: Playing animation [${this.debugAnimIndex}] "${i}"`),this.playerModel.play(i,{loop:!0,fadeTime:.1}),this.debugAnimLockUntil=Date.now()+5e3;const s=document.getElementById("debug-anim")||(()=>{const n=document.createElement("div");return n.id="debug-anim",n.style.cssText="position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#0f0;padding:10px 20px;font-family:monospace;font-size:18px;z-index:9999;border-radius:5px;",document.body.appendChild(n),n})();s.textContent=`Animation: ${i} (locked 5s)`}isDebugAnimLocked(){return Date.now()<this.debugAnimLockUntil}}const ys={type:"change"},Ti={type:"start"},bs={type:"end"},Qt=new Nn,ws=new jn,qa=Math.cos(70*R.DEG2RAD);class Va extends Bn{constructor(e,t){super(),this.object=e,this.domElement=t,this.domElement.style.touchAction="none",this.enabled=!0,this.target=new m,this.cursor=new m,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:Xe.ROTATE,MIDDLE:Xe.DOLLY,RIGHT:Xe.PAN},this.touches={ONE:ft.ROTATE,TWO:ft.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this.getPolarAngle=function(){return a.phi},this.getAzimuthalAngle=function(){return a.theta},this.getDistance=function(){return this.object.position.distanceTo(this.target)},this.listenToKeyEvents=function(g){g.addEventListener("keydown",Mt),this._domElementKeyEvents=g},this.stopListenToKeyEvents=function(){this._domElementKeyEvents.removeEventListener("keydown",Mt),this._domElementKeyEvents=null},this.saveState=function(){i.target0.copy(i.target),i.position0.copy(i.object.position),i.zoom0=i.object.zoom},this.reset=function(){i.target.copy(i.target0),i.object.position.copy(i.position0),i.object.zoom=i.zoom0,i.object.updateProjectionMatrix(),i.dispatchEvent(ys),i.update(),n=s.NONE},this.update=function(){const g=new m,E=new G().setFromUnitVectors(e.up,new m(0,1,0)),F=E.clone().invert(),H=new m,de=new G,ze=new m,be=2*Math.PI;return function(dn=null){const Zi=i.object.position;g.copy(Zi).sub(i.target),g.applyQuaternion(E),a.setFromVector3(g),i.autoRotate&&n===s.NONE&&W(q(dn)),i.enableDamping?(a.theta+=r.theta*i.dampingFactor,a.phi+=r.phi*i.dampingFactor):(a.theta+=r.theta,a.phi+=r.phi);let Pe=i.minAzimuthAngle,Re=i.maxAzimuthAngle;isFinite(Pe)&&isFinite(Re)&&(Pe<-Math.PI?Pe+=be:Pe>Math.PI&&(Pe-=be),Re<-Math.PI?Re+=be:Re>Math.PI&&(Re-=be),Pe<=Re?a.theta=Math.max(Pe,Math.min(Re,a.theta)):a.theta=a.theta>(Pe+Re)/2?Math.max(Pe,a.theta):Math.min(Re,a.theta)),a.phi=Math.max(i.minPolarAngle,Math.min(i.maxPolarAngle,a.phi)),a.makeSafe(),i.enableDamping===!0?i.target.addScaledVector(d,i.dampingFactor):i.target.add(d),i.target.sub(i.cursor),i.target.clampLength(i.minTargetRadius,i.maxTargetRadius),i.target.add(i.cursor);let At=!1;if(i.zoomToCursor&&L||i.object.isOrthographicCamera)a.radius=Q(a.radius);else{const _e=a.radius;a.radius=Q(a.radius*l),At=_e!=a.radius}if(g.setFromSpherical(a),g.applyQuaternion(F),Zi.copy(i.target).add(g),i.object.lookAt(i.target),i.enableDamping===!0?(r.theta*=1-i.dampingFactor,r.phi*=1-i.dampingFactor,d.multiplyScalar(1-i.dampingFactor)):(r.set(0,0,0),d.set(0,0,0)),i.zoomToCursor&&L){let _e=null;if(i.object.isPerspectiveCamera){const Lt=g.length();_e=Q(Lt*l);const Yt=Lt-_e;i.object.position.addScaledVector(C,Yt),i.object.updateMatrixWorld(),At=!!Yt}else if(i.object.isOrthographicCamera){const Lt=new m(P.x,P.y,0);Lt.unproject(i.object);const Yt=i.object.zoom;i.object.zoom=Math.max(i.minZoom,Math.min(i.maxZoom,i.object.zoom/l)),i.object.updateProjectionMatrix(),At=Yt!==i.object.zoom;const Qi=new m(P.x,P.y,0);Qi.unproject(i.object),i.object.position.sub(Qi).add(Lt),i.object.updateMatrixWorld(),_e=g.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),i.zoomToCursor=!1;_e!==null&&(this.screenSpacePanning?i.target.set(0,0,-1).transformDirection(i.object.matrix).multiplyScalar(_e).add(i.object.position):(Qt.origin.copy(i.object.position),Qt.direction.set(0,0,-1).transformDirection(i.object.matrix),Math.abs(i.object.up.dot(Qt.direction))<qa?e.lookAt(i.target):(ws.setFromNormalAndCoplanarPoint(i.object.up,i.target),Qt.intersectPlane(ws,i.target))))}else if(i.object.isOrthographicCamera){const _e=i.object.zoom;i.object.zoom=Math.max(i.minZoom,Math.min(i.maxZoom,i.object.zoom/l)),_e!==i.object.zoom&&(i.object.updateProjectionMatrix(),At=!0)}return l=1,L=!1,At||H.distanceToSquared(i.object.position)>o||8*(1-de.dot(i.object.quaternion))>o||ze.distanceToSquared(i.target)>o?(i.dispatchEvent(ys),H.copy(i.object.position),de.copy(i.object.quaternion),ze.copy(i.target),!0):!1}}(),this.dispose=function(){i.domElement.removeEventListener("contextmenu",ut),i.domElement.removeEventListener("pointerdown",Ct),i.domElement.removeEventListener("pointercancel",Te),i.domElement.removeEventListener("wheel",dt),i.domElement.removeEventListener("pointermove",et),i.domElement.removeEventListener("pointerup",Te),i.domElement.getRootNode().removeEventListener("keydown",pt,{capture:!0}),i._domElementKeyEvents!==null&&(i._domElementKeyEvents.removeEventListener("keydown",Mt),i._domElementKeyEvents=null)};const i=this,s={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6};let n=s.NONE;const o=1e-6,a=new ts,r=new ts;let l=1;const d=new m,c=new le,h=new le,u=new le,y=new le,b=new le,w=new le,x=new le,v=new le,S=new le,C=new m,P=new le;let L=!1;const M=[],_={};let U=!1;function q(g){return g!==null?2*Math.PI/60*i.autoRotateSpeed*g:2*Math.PI/60/60*i.autoRotateSpeed}function oe(g){const E=Math.abs(g*.01);return Math.pow(.95,i.zoomSpeed*E)}function W(g){r.theta-=g}function ce(g){r.phi-=g}const te=function(){const g=new m;return function(F,H){g.setFromMatrixColumn(H,0),g.multiplyScalar(-F),d.add(g)}}(),K=function(){const g=new m;return function(F,H){i.screenSpacePanning===!0?g.setFromMatrixColumn(H,1):(g.setFromMatrixColumn(H,0),g.crossVectors(i.object.up,g)),g.multiplyScalar(F),d.add(g)}}(),Z=function(){const g=new m;return function(F,H){const de=i.domElement;if(i.object.isPerspectiveCamera){const ze=i.object.position;g.copy(ze).sub(i.target);let be=g.length();be*=Math.tan(i.object.fov/2*Math.PI/180),te(2*F*be/de.clientHeight,i.object.matrix),K(2*H*be/de.clientHeight,i.object.matrix)}else i.object.isOrthographicCamera?(te(F*(i.object.right-i.object.left)/i.object.zoom/de.clientWidth,i.object.matrix),K(H*(i.object.top-i.object.bottom)/i.object.zoom/de.clientHeight,i.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),i.enablePan=!1)}}();function ie(g){i.object.isPerspectiveCamera||i.object.isOrthographicCamera?l/=g:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),i.enableZoom=!1)}function ge(g){i.object.isPerspectiveCamera||i.object.isOrthographicCamera?l*=g:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),i.enableZoom=!1)}function z(g,E){if(!i.zoomToCursor)return;L=!0;const F=i.domElement.getBoundingClientRect(),H=g-F.left,de=E-F.top,ze=F.width,be=F.height;P.x=H/ze*2-1,P.y=-(de/be)*2+1,C.set(P.x,P.y,1).unproject(i.object).sub(i.object.position).normalize()}function Q(g){return Math.max(i.minDistance,Math.min(i.maxDistance,g))}function ye(g){c.set(g.clientX,g.clientY)}function ae(g){z(g.clientX,g.clientX),x.set(g.clientX,g.clientY)}function fe(g){y.set(g.clientX,g.clientY)}function ve(g){h.set(g.clientX,g.clientY),u.subVectors(h,c).multiplyScalar(i.rotateSpeed);const E=i.domElement;W(2*Math.PI*u.x/E.clientHeight),ce(2*Math.PI*u.y/E.clientHeight),c.copy(h),i.update()}function Ge(g){v.set(g.clientX,g.clientY),S.subVectors(v,x),S.y>0?ie(oe(S.y)):S.y<0&&ge(oe(S.y)),x.copy(v),i.update()}function Qe(g){b.set(g.clientX,g.clientY),w.subVectors(b,y).multiplyScalar(i.panSpeed),Z(w.x,w.y),y.copy(b),i.update()}function Be(g){z(g.clientX,g.clientY),g.deltaY<0?ge(oe(g.deltaY)):g.deltaY>0&&ie(oe(g.deltaY)),i.update()}function Se(g){let E=!1;switch(g.code){case i.keys.UP:g.ctrlKey||g.metaKey||g.shiftKey?ce(2*Math.PI*i.rotateSpeed/i.domElement.clientHeight):Z(0,i.keyPanSpeed),E=!0;break;case i.keys.BOTTOM:g.ctrlKey||g.metaKey||g.shiftKey?ce(-2*Math.PI*i.rotateSpeed/i.domElement.clientHeight):Z(0,-i.keyPanSpeed),E=!0;break;case i.keys.LEFT:g.ctrlKey||g.metaKey||g.shiftKey?W(2*Math.PI*i.rotateSpeed/i.domElement.clientHeight):Z(i.keyPanSpeed,0),E=!0;break;case i.keys.RIGHT:g.ctrlKey||g.metaKey||g.shiftKey?W(-2*Math.PI*i.rotateSpeed/i.domElement.clientHeight):Z(-i.keyPanSpeed,0),E=!0;break}E&&(g.preventDefault(),i.update())}function rt(g){if(M.length===1)c.set(g.pageX,g.pageY);else{const E=mt(g),F=.5*(g.pageX+E.x),H=.5*(g.pageY+E.y);c.set(F,H)}}function Ne(g){if(M.length===1)y.set(g.pageX,g.pageY);else{const E=mt(g),F=.5*(g.pageX+E.x),H=.5*(g.pageY+E.y);y.set(F,H)}}function lt(g){const E=mt(g),F=g.pageX-E.x,H=g.pageY-E.y,de=Math.sqrt(F*F+H*H);x.set(0,de)}function St(g){i.enableZoom&&lt(g),i.enablePan&&Ne(g)}function Je(g){i.enableZoom&&lt(g),i.enableRotate&&rt(g)}function Tt(g){if(M.length==1)h.set(g.pageX,g.pageY);else{const F=mt(g),H=.5*(g.pageX+F.x),de=.5*(g.pageY+F.y);h.set(H,de)}u.subVectors(h,c).multiplyScalar(i.rotateSpeed);const E=i.domElement;W(2*Math.PI*u.x/E.clientHeight),ce(2*Math.PI*u.y/E.clientHeight),c.copy(h)}function ct(g){if(M.length===1)b.set(g.pageX,g.pageY);else{const E=mt(g),F=.5*(g.pageX+E.x),H=.5*(g.pageY+E.y);b.set(F,H)}w.subVectors(b,y).multiplyScalar(i.panSpeed),Z(w.x,w.y),y.copy(b)}function je(g){const E=mt(g),F=g.pageX-E.x,H=g.pageY-E.y,de=Math.sqrt(F*F+H*H);v.set(0,de),S.set(0,Math.pow(v.y/x.y,i.zoomSpeed)),ie(S.y),x.copy(v);const ze=(g.pageX+E.x)*.5,be=(g.pageY+E.y)*.5;z(ze,be)}function $t(g){i.enableZoom&&je(g),i.enablePan&&ct(g)}function kt(g){i.enableZoom&&je(g),i.enableRotate&&Tt(g)}function Ct(g){i.enabled!==!1&&(M.length===0&&(i.domElement.setPointerCapture(g.pointerId),i.domElement.addEventListener("pointermove",et),i.domElement.addEventListener("pointerup",Te)),!cn(g)&&(di(g),g.pointerType==="touch"?it(g):Et(g)))}function et(g){i.enabled!==!1&&(g.pointerType==="touch"?ci(g):tt(g))}function Te(g){switch(Xt(g),M.length){case 0:i.domElement.releasePointerCapture(g.pointerId),i.domElement.removeEventListener("pointermove",et),i.domElement.removeEventListener("pointerup",Te),i.dispatchEvent(bs),n=s.NONE;break;case 1:const E=M[0],F=_[E];it({pointerId:E,pageX:F.x,pageY:F.y});break}}function Et(g){let E;switch(g.button){case 0:E=i.mouseButtons.LEFT;break;case 1:E=i.mouseButtons.MIDDLE;break;case 2:E=i.mouseButtons.RIGHT;break;default:E=-1}switch(E){case Xe.DOLLY:if(i.enableZoom===!1)return;ae(g),n=s.DOLLY;break;case Xe.ROTATE:if(g.ctrlKey||g.metaKey||g.shiftKey){if(i.enablePan===!1)return;fe(g),n=s.PAN}else{if(i.enableRotate===!1)return;ye(g),n=s.ROTATE}break;case Xe.PAN:if(g.ctrlKey||g.metaKey||g.shiftKey){if(i.enableRotate===!1)return;ye(g),n=s.ROTATE}else{if(i.enablePan===!1)return;fe(g),n=s.PAN}break;default:n=s.NONE}n!==s.NONE&&i.dispatchEvent(Ti)}function tt(g){switch(n){case s.ROTATE:if(i.enableRotate===!1)return;ve(g);break;case s.DOLLY:if(i.enableZoom===!1)return;Ge(g);break;case s.PAN:if(i.enablePan===!1)return;Qe(g);break}}function dt(g){i.enabled===!1||i.enableZoom===!1||n!==s.NONE||(g.preventDefault(),i.dispatchEvent(Ti),Be(ht(g)),i.dispatchEvent(bs))}function ht(g){const E=g.deltaMode,F={clientX:g.clientX,clientY:g.clientY,deltaY:g.deltaY};switch(E){case 1:F.deltaY*=16;break;case 2:F.deltaY*=100;break}return g.ctrlKey&&!U&&(F.deltaY*=10),F}function pt(g){g.key==="Control"&&(U=!0,i.domElement.getRootNode().addEventListener("keyup",Ce,{passive:!0,capture:!0}))}function Ce(g){g.key==="Control"&&(U=!1,i.domElement.getRootNode().removeEventListener("keyup",Ce,{passive:!0,capture:!0}))}function Mt(g){i.enabled===!1||i.enablePan===!1||Se(g)}function it(g){switch(Wi(g),M.length){case 1:switch(i.touches.ONE){case ft.ROTATE:if(i.enableRotate===!1)return;rt(g),n=s.TOUCH_ROTATE;break;case ft.PAN:if(i.enablePan===!1)return;Ne(g),n=s.TOUCH_PAN;break;default:n=s.NONE}break;case 2:switch(i.touches.TWO){case ft.DOLLY_PAN:if(i.enableZoom===!1&&i.enablePan===!1)return;St(g),n=s.TOUCH_DOLLY_PAN;break;case ft.DOLLY_ROTATE:if(i.enableZoom===!1&&i.enableRotate===!1)return;Je(g),n=s.TOUCH_DOLLY_ROTATE;break;default:n=s.NONE}break;default:n=s.NONE}n!==s.NONE&&i.dispatchEvent(Ti)}function ci(g){switch(Wi(g),n){case s.TOUCH_ROTATE:if(i.enableRotate===!1)return;Tt(g),i.update();break;case s.TOUCH_PAN:if(i.enablePan===!1)return;ct(g),i.update();break;case s.TOUCH_DOLLY_PAN:if(i.enableZoom===!1&&i.enablePan===!1)return;$t(g),i.update();break;case s.TOUCH_DOLLY_ROTATE:if(i.enableZoom===!1&&i.enableRotate===!1)return;kt(g),i.update();break;default:n=s.NONE}}function ut(g){i.enabled!==!1&&g.preventDefault()}function di(g){M.push(g.pointerId)}function Xt(g){delete _[g.pointerId];for(let E=0;E<M.length;E++)if(M[E]==g.pointerId){M.splice(E,1);return}}function cn(g){for(let E=0;E<M.length;E++)if(M[E]==g.pointerId)return!0;return!1}function Wi(g){let E=_[g.pointerId];E===void 0&&(E=new le,_[g.pointerId]=E),E.set(g.pageX,g.pageY)}function mt(g){const E=g.pointerId===M[0]?M[1]:M[0];return _[E]}i.domElement.addEventListener("contextmenu",ut),i.domElement.addEventListener("pointerdown",Ct),i.domElement.addEventListener("pointercancel",Te),i.domElement.addEventListener("wheel",dt,{passive:!1}),i.domElement.getRootNode().addEventListener("keydown",pt,{passive:!0,capture:!0}),this.update()}}const nt=new qs,re=new m,qe=new m,Y=new G,xs={X:new m(1,0,0),Y:new m(0,1,0),Z:new m(0,0,1)},ki={type:"change"},vs={type:"mouseDown"},Ss={type:"mouseUp",mode:null},Ts={type:"objectChange"};class $a extends Ze{constructor(e,t){super(),t===void 0&&(console.warn('THREE.TransformControls: The second parameter "domElement" is now mandatory.'),t=document),this.isTransformControls=!0,this.visible=!1,this.domElement=t,this.domElement.style.touchAction="none";const i=new Qa;this._gizmo=i,this.add(i);const s=new Ja;this._plane=s,this.add(s);const n=this;function o(v,S){let C=S;Object.defineProperty(n,v,{get:function(){return C!==void 0?C:S},set:function(P){C!==P&&(C=P,s[v]=P,i[v]=P,n.dispatchEvent({type:v+"-changed",value:P}),n.dispatchEvent(ki))}}),n[v]=S,s[v]=S,i[v]=S}o("camera",e),o("object",void 0),o("enabled",!0),o("axis",null),o("mode","translate"),o("translationSnap",null),o("rotationSnap",null),o("scaleSnap",null),o("space","world"),o("size",1),o("dragging",!1),o("showX",!0),o("showY",!0),o("showZ",!0);const a=new m,r=new m,l=new G,d=new G,c=new m,h=new G,u=new m,y=new m,b=new m,w=0,x=new m;o("worldPosition",a),o("worldPositionStart",r),o("worldQuaternion",l),o("worldQuaternionStart",d),o("cameraPosition",c),o("cameraQuaternion",h),o("pointStart",u),o("pointEnd",y),o("rotationAxis",b),o("rotationAngle",w),o("eye",x),this._offset=new m,this._startNorm=new m,this._endNorm=new m,this._cameraScale=new m,this._parentPosition=new m,this._parentQuaternion=new G,this._parentQuaternionInv=new G,this._parentScale=new m,this._worldScaleStart=new m,this._worldQuaternionInv=new G,this._worldScale=new m,this._positionStart=new m,this._quaternionStart=new G,this._scaleStart=new m,this._getPointer=Xa.bind(this),this._onPointerDown=Ka.bind(this),this._onPointerHover=Ya.bind(this),this._onPointerMove=Wa.bind(this),this._onPointerUp=Za.bind(this),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointermove",this._onPointerHover),this.domElement.addEventListener("pointerup",this._onPointerUp)}updateMatrixWorld(){this.object!==void 0&&(this.object.updateMatrixWorld(),this.object.parent===null?console.error("TransformControls: The attached 3D object must be a part of the scene graph."):this.object.parent.matrixWorld.decompose(this._parentPosition,this._parentQuaternion,this._parentScale),this.object.matrixWorld.decompose(this.worldPosition,this.worldQuaternion,this._worldScale),this._parentQuaternionInv.copy(this._parentQuaternion).invert(),this._worldQuaternionInv.copy(this.worldQuaternion).invert()),this.camera.updateMatrixWorld(),this.camera.matrixWorld.decompose(this.cameraPosition,this.cameraQuaternion,this._cameraScale),this.camera.isOrthographicCamera?this.camera.getWorldDirection(this.eye).negate():this.eye.copy(this.cameraPosition).sub(this.worldPosition).normalize(),super.updateMatrixWorld(this)}pointerHover(e){if(this.object===void 0||this.dragging===!0)return;e!==null&&nt.setFromCamera(e,this.camera);const t=Ci(this._gizmo.picker[this.mode],nt);t?this.axis=t.object.name:this.axis=null}pointerDown(e){if(!(this.object===void 0||this.dragging===!0||e!=null&&e.button!==0)&&this.axis!==null){e!==null&&nt.setFromCamera(e,this.camera);const t=Ci(this._plane,nt,!0);t&&(this.object.updateMatrixWorld(),this.object.parent.updateMatrixWorld(),this._positionStart.copy(this.object.position),this._quaternionStart.copy(this.object.quaternion),this._scaleStart.copy(this.object.scale),this.object.matrixWorld.decompose(this.worldPositionStart,this.worldQuaternionStart,this._worldScaleStart),this.pointStart.copy(t.point).sub(this.worldPositionStart)),this.dragging=!0,vs.mode=this.mode,this.dispatchEvent(vs)}}pointerMove(e){const t=this.axis,i=this.mode,s=this.object;let n=this.space;if(i==="scale"?n="local":(t==="E"||t==="XYZE"||t==="XYZ")&&(n="world"),s===void 0||t===null||this.dragging===!1||e!==null&&e.button!==-1)return;e!==null&&nt.setFromCamera(e,this.camera);const o=Ci(this._plane,nt,!0);if(o){if(this.pointEnd.copy(o.point).sub(this.worldPositionStart),i==="translate")this._offset.copy(this.pointEnd).sub(this.pointStart),n==="local"&&t!=="XYZ"&&this._offset.applyQuaternion(this._worldQuaternionInv),t.indexOf("X")===-1&&(this._offset.x=0),t.indexOf("Y")===-1&&(this._offset.y=0),t.indexOf("Z")===-1&&(this._offset.z=0),n==="local"&&t!=="XYZ"?this._offset.applyQuaternion(this._quaternionStart).divide(this._parentScale):this._offset.applyQuaternion(this._parentQuaternionInv).divide(this._parentScale),s.position.copy(this._offset).add(this._positionStart),this.translationSnap&&(n==="local"&&(s.position.applyQuaternion(Y.copy(this._quaternionStart).invert()),t.search("X")!==-1&&(s.position.x=Math.round(s.position.x/this.translationSnap)*this.translationSnap),t.search("Y")!==-1&&(s.position.y=Math.round(s.position.y/this.translationSnap)*this.translationSnap),t.search("Z")!==-1&&(s.position.z=Math.round(s.position.z/this.translationSnap)*this.translationSnap),s.position.applyQuaternion(this._quaternionStart)),n==="world"&&(s.parent&&s.position.add(re.setFromMatrixPosition(s.parent.matrixWorld)),t.search("X")!==-1&&(s.position.x=Math.round(s.position.x/this.translationSnap)*this.translationSnap),t.search("Y")!==-1&&(s.position.y=Math.round(s.position.y/this.translationSnap)*this.translationSnap),t.search("Z")!==-1&&(s.position.z=Math.round(s.position.z/this.translationSnap)*this.translationSnap),s.parent&&s.position.sub(re.setFromMatrixPosition(s.parent.matrixWorld))));else if(i==="scale"){if(t.search("XYZ")!==-1){let a=this.pointEnd.length()/this.pointStart.length();this.pointEnd.dot(this.pointStart)<0&&(a*=-1),qe.set(a,a,a)}else re.copy(this.pointStart),qe.copy(this.pointEnd),re.applyQuaternion(this._worldQuaternionInv),qe.applyQuaternion(this._worldQuaternionInv),qe.divide(re),t.search("X")===-1&&(qe.x=1),t.search("Y")===-1&&(qe.y=1),t.search("Z")===-1&&(qe.z=1);s.scale.copy(this._scaleStart).multiply(qe),this.scaleSnap&&(t.search("X")!==-1&&(s.scale.x=Math.round(s.scale.x/this.scaleSnap)*this.scaleSnap||this.scaleSnap),t.search("Y")!==-1&&(s.scale.y=Math.round(s.scale.y/this.scaleSnap)*this.scaleSnap||this.scaleSnap),t.search("Z")!==-1&&(s.scale.z=Math.round(s.scale.z/this.scaleSnap)*this.scaleSnap||this.scaleSnap))}else if(i==="rotate"){this._offset.copy(this.pointEnd).sub(this.pointStart);const a=20/this.worldPosition.distanceTo(re.setFromMatrixPosition(this.camera.matrixWorld));let r=!1;t==="XYZE"?(this.rotationAxis.copy(this._offset).cross(this.eye).normalize(),this.rotationAngle=this._offset.dot(re.copy(this.rotationAxis).cross(this.eye))*a):(t==="X"||t==="Y"||t==="Z")&&(this.rotationAxis.copy(xs[t]),re.copy(xs[t]),n==="local"&&re.applyQuaternion(this.worldQuaternion),re.cross(this.eye),re.length()===0?r=!0:this.rotationAngle=this._offset.dot(re.normalize())*a),(t==="E"||r)&&(this.rotationAxis.copy(this.eye),this.rotationAngle=this.pointEnd.angleTo(this.pointStart),this._startNorm.copy(this.pointStart).normalize(),this._endNorm.copy(this.pointEnd).normalize(),this.rotationAngle*=this._endNorm.cross(this._startNorm).dot(this.eye)<0?1:-1),this.rotationSnap&&(this.rotationAngle=Math.round(this.rotationAngle/this.rotationSnap)*this.rotationSnap),n==="local"&&t!=="E"&&t!=="XYZE"?(s.quaternion.copy(this._quaternionStart),s.quaternion.multiply(Y.setFromAxisAngle(this.rotationAxis,this.rotationAngle)).normalize()):(this.rotationAxis.applyQuaternion(this._parentQuaternionInv),s.quaternion.copy(Y.setFromAxisAngle(this.rotationAxis,this.rotationAngle)),s.quaternion.multiply(this._quaternionStart).normalize())}this.dispatchEvent(ki),this.dispatchEvent(Ts)}}pointerUp(e){e!==null&&e.button!==0||(this.dragging&&this.axis!==null&&(Ss.mode=this.mode,this.dispatchEvent(Ss)),this.dragging=!1,this.axis=null)}dispose(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerHover),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.traverse(function(e){e.geometry&&e.geometry.dispose(),e.material&&e.material.dispose()})}attach(e){return this.object=e,this.visible=!0,this}detach(){return this.object=void 0,this.visible=!1,this.axis=null,this}reset(){this.enabled&&this.dragging&&(this.object.position.copy(this._positionStart),this.object.quaternion.copy(this._quaternionStart),this.object.scale.copy(this._scaleStart),this.dispatchEvent(ki),this.dispatchEvent(Ts),this.pointStart.copy(this.pointEnd))}getRaycaster(){return nt}getMode(){return this.mode}setMode(e){this.mode=e}setTranslationSnap(e){this.translationSnap=e}setRotationSnap(e){this.rotationSnap=e}setScaleSnap(e){this.scaleSnap=e}setSize(e){this.size=e}setSpace(e){this.space=e}}function Xa(p){if(this.domElement.ownerDocument.pointerLockElement)return{x:0,y:0,button:p.button};{const e=this.domElement.getBoundingClientRect();return{x:(p.clientX-e.left)/e.width*2-1,y:-(p.clientY-e.top)/e.height*2+1,button:p.button}}}function Ya(p){if(this.enabled)switch(p.pointerType){case"mouse":case"pen":this.pointerHover(this._getPointer(p));break}}function Ka(p){this.enabled&&(document.pointerLockElement||this.domElement.setPointerCapture(p.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.pointerHover(this._getPointer(p)),this.pointerDown(this._getPointer(p)))}function Wa(p){this.enabled&&this.pointerMove(this._getPointer(p))}function Za(p){this.enabled&&(this.domElement.releasePointerCapture(p.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.pointerUp(this._getPointer(p)))}function Ci(p,e,t){const i=e.intersectObject(p,!0);for(let s=0;s<i.length;s++)if(i[s].object.visible||t)return i[s];return!1}const Jt=new ne,j=new m(0,1,0),ks=new m(0,0,0),Cs=new N,ei=new G,ii=new G,Ee=new m,Es=new N,Ft=new m(1,0,0),ot=new m(0,1,0),Dt=new m(0,0,1),ti=new m,_t=new m,It=new m;class Qa extends Ze{constructor(){super(),this.isTransformControlsGizmo=!0,this.type="TransformControlsGizmo";const e=new Ke({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),t=new ai({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),i=e.clone();i.opacity=.15;const s=t.clone();s.opacity=.5;const n=e.clone();n.color.setHex(16711680);const o=e.clone();o.color.setHex(65280);const a=e.clone();a.color.setHex(255);const r=e.clone();r.color.setHex(16711680),r.opacity=.5;const l=e.clone();l.color.setHex(65280),l.opacity=.5;const d=e.clone();d.color.setHex(255),d.opacity=.5;const c=e.clone();c.opacity=.25;const h=e.clone();h.color.setHex(16776960),h.opacity=.25,e.clone().color.setHex(16776960);const y=e.clone();y.color.setHex(7895160);const b=new O(0,.04,.1,12);b.translate(0,.05,0);const w=new k(.08,.08,.08);w.translate(0,.04,0);const x=new Oe;x.setAttribute("position",new $e([0,0,0,1,0,0],3));const v=new O(.0075,.0075,.5,3);v.translate(0,.25,0);function S(K,Z){const ie=new Pt(K,.0075,3,64,Z*Math.PI*2);return ie.rotateY(Math.PI/2),ie.rotateX(Math.PI/2),ie}function C(){const K=new Oe;return K.setAttribute("position",new $e([0,0,0,1,1,1],3)),K}const P={X:[[new f(b,n),[.5,0,0],[0,0,-Math.PI/2]],[new f(b,n),[-.5,0,0],[0,0,Math.PI/2]],[new f(v,n),[0,0,0],[0,0,-Math.PI/2]]],Y:[[new f(b,o),[0,.5,0]],[new f(b,o),[0,-.5,0],[Math.PI,0,0]],[new f(v,o)]],Z:[[new f(b,a),[0,0,.5],[Math.PI/2,0,0]],[new f(b,a),[0,0,-.5],[-Math.PI/2,0,0]],[new f(v,a),null,[Math.PI/2,0,0]]],XYZ:[[new f(new Kt(.1,0),c.clone()),[0,0,0]]],XY:[[new f(new k(.15,.15,.01),d.clone()),[.15,.15,0]]],YZ:[[new f(new k(.15,.15,.01),r.clone()),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new f(new k(.15,.15,.01),l.clone()),[.15,0,.15],[-Math.PI/2,0,0]]]},L={X:[[new f(new O(.2,0,.6,4),i),[.3,0,0],[0,0,-Math.PI/2]],[new f(new O(.2,0,.6,4),i),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new f(new O(.2,0,.6,4),i),[0,.3,0]],[new f(new O(.2,0,.6,4),i),[0,-.3,0],[0,0,Math.PI]]],Z:[[new f(new O(.2,0,.6,4),i),[0,0,.3],[Math.PI/2,0,0]],[new f(new O(.2,0,.6,4),i),[0,0,-.3],[-Math.PI/2,0,0]]],XYZ:[[new f(new Kt(.2,0),i)]],XY:[[new f(new k(.2,.2,.01),i),[.15,.15,0]]],YZ:[[new f(new k(.2,.2,.01),i),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new f(new k(.2,.2,.01),i),[.15,0,.15],[-Math.PI/2,0,0]]]},M={START:[[new f(new Kt(.01,2),s),null,null,null,"helper"]],END:[[new f(new Kt(.01,2),s),null,null,null,"helper"]],DELTA:[[new Me(C(),s),null,null,null,"helper"]],X:[[new Me(x,s.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new Me(x,s.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new Me(x,s.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]},_={XYZE:[[new f(S(.5,1),y),null,[0,Math.PI/2,0]]],X:[[new f(S(.5,.5),n)]],Y:[[new f(S(.5,.5),o),null,[0,0,-Math.PI/2]]],Z:[[new f(S(.5,.5),a),null,[0,Math.PI/2,0]]],E:[[new f(S(.75,1),h),null,[0,Math.PI/2,0]]]},U={AXIS:[[new Me(x,s.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]]},q={XYZE:[[new f(new pe(.25,10,8),i)]],X:[[new f(new Pt(.5,.1,4,24),i),[0,0,0],[0,-Math.PI/2,-Math.PI/2]]],Y:[[new f(new Pt(.5,.1,4,24),i),[0,0,0],[Math.PI/2,0,0]]],Z:[[new f(new Pt(.5,.1,4,24),i),[0,0,0],[0,0,-Math.PI/2]]],E:[[new f(new Pt(.75,.1,2,24),i)]]},oe={X:[[new f(w,n),[.5,0,0],[0,0,-Math.PI/2]],[new f(v,n),[0,0,0],[0,0,-Math.PI/2]],[new f(w,n),[-.5,0,0],[0,0,Math.PI/2]]],Y:[[new f(w,o),[0,.5,0]],[new f(v,o)],[new f(w,o),[0,-.5,0],[0,0,Math.PI]]],Z:[[new f(w,a),[0,0,.5],[Math.PI/2,0,0]],[new f(v,a),[0,0,0],[Math.PI/2,0,0]],[new f(w,a),[0,0,-.5],[-Math.PI/2,0,0]]],XY:[[new f(new k(.15,.15,.01),d),[.15,.15,0]]],YZ:[[new f(new k(.15,.15,.01),r),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new f(new k(.15,.15,.01),l),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new f(new k(.1,.1,.1),c.clone())]]},W={X:[[new f(new O(.2,0,.6,4),i),[.3,0,0],[0,0,-Math.PI/2]],[new f(new O(.2,0,.6,4),i),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new f(new O(.2,0,.6,4),i),[0,.3,0]],[new f(new O(.2,0,.6,4),i),[0,-.3,0],[0,0,Math.PI]]],Z:[[new f(new O(.2,0,.6,4),i),[0,0,.3],[Math.PI/2,0,0]],[new f(new O(.2,0,.6,4),i),[0,0,-.3],[-Math.PI/2,0,0]]],XY:[[new f(new k(.2,.2,.01),i),[.15,.15,0]]],YZ:[[new f(new k(.2,.2,.01),i),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new f(new k(.2,.2,.01),i),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new f(new k(.2,.2,.2),i),[0,0,0]]]},ce={X:[[new Me(x,s.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new Me(x,s.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new Me(x,s.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]};function te(K){const Z=new Ze;for(const ie in K)for(let ge=K[ie].length;ge--;){const z=K[ie][ge][0].clone(),Q=K[ie][ge][1],ye=K[ie][ge][2],ae=K[ie][ge][3],fe=K[ie][ge][4];z.name=ie,z.tag=fe,Q&&z.position.set(Q[0],Q[1],Q[2]),ye&&z.rotation.set(ye[0],ye[1],ye[2]),ae&&z.scale.set(ae[0],ae[1],ae[2]),z.updateMatrix();const ve=z.geometry.clone();ve.applyMatrix4(z.matrix),z.geometry=ve,z.renderOrder=1/0,z.position.set(0,0,0),z.rotation.set(0,0,0),z.scale.set(1,1,1),Z.add(z)}return Z}this.gizmo={},this.picker={},this.helper={},this.add(this.gizmo.translate=te(P)),this.add(this.gizmo.rotate=te(_)),this.add(this.gizmo.scale=te(oe)),this.add(this.picker.translate=te(L)),this.add(this.picker.rotate=te(q)),this.add(this.picker.scale=te(W)),this.add(this.helper.translate=te(M)),this.add(this.helper.rotate=te(U)),this.add(this.helper.scale=te(ce)),this.picker.translate.visible=!1,this.picker.rotate.visible=!1,this.picker.scale.visible=!1}updateMatrixWorld(e){const i=(this.mode==="scale"?"local":this.space)==="local"?this.worldQuaternion:ii;this.gizmo.translate.visible=this.mode==="translate",this.gizmo.rotate.visible=this.mode==="rotate",this.gizmo.scale.visible=this.mode==="scale",this.helper.translate.visible=this.mode==="translate",this.helper.rotate.visible=this.mode==="rotate",this.helper.scale.visible=this.mode==="scale";let s=[];s=s.concat(this.picker[this.mode].children),s=s.concat(this.gizmo[this.mode].children),s=s.concat(this.helper[this.mode].children);for(let n=0;n<s.length;n++){const o=s[n];o.visible=!0,o.rotation.set(0,0,0),o.position.copy(this.worldPosition);let a;if(this.camera.isOrthographicCamera?a=(this.camera.top-this.camera.bottom)/this.camera.zoom:a=this.worldPosition.distanceTo(this.cameraPosition)*Math.min(1.9*Math.tan(Math.PI*this.camera.fov/360)/this.camera.zoom,7),o.scale.set(1,1,1).multiplyScalar(a*this.size/4),o.tag==="helper"){o.visible=!1,o.name==="AXIS"?(o.visible=!!this.axis,this.axis==="X"&&(Y.setFromEuler(Jt.set(0,0,0)),o.quaternion.copy(i).multiply(Y),Math.abs(j.copy(Ft).applyQuaternion(i).dot(this.eye))>.9&&(o.visible=!1)),this.axis==="Y"&&(Y.setFromEuler(Jt.set(0,0,Math.PI/2)),o.quaternion.copy(i).multiply(Y),Math.abs(j.copy(ot).applyQuaternion(i).dot(this.eye))>.9&&(o.visible=!1)),this.axis==="Z"&&(Y.setFromEuler(Jt.set(0,Math.PI/2,0)),o.quaternion.copy(i).multiply(Y),Math.abs(j.copy(Dt).applyQuaternion(i).dot(this.eye))>.9&&(o.visible=!1)),this.axis==="XYZE"&&(Y.setFromEuler(Jt.set(0,Math.PI/2,0)),j.copy(this.rotationAxis),o.quaternion.setFromRotationMatrix(Cs.lookAt(ks,j,ot)),o.quaternion.multiply(Y),o.visible=this.dragging),this.axis==="E"&&(o.visible=!1)):o.name==="START"?(o.position.copy(this.worldPositionStart),o.visible=this.dragging):o.name==="END"?(o.position.copy(this.worldPosition),o.visible=this.dragging):o.name==="DELTA"?(o.position.copy(this.worldPositionStart),o.quaternion.copy(this.worldQuaternionStart),re.set(1e-10,1e-10,1e-10).add(this.worldPositionStart).sub(this.worldPosition).multiplyScalar(-1),re.applyQuaternion(this.worldQuaternionStart.clone().invert()),o.scale.copy(re),o.visible=this.dragging):(o.quaternion.copy(i),this.dragging?o.position.copy(this.worldPositionStart):o.position.copy(this.worldPosition),this.axis&&(o.visible=this.axis.search(o.name)!==-1));continue}o.quaternion.copy(i),this.mode==="translate"||this.mode==="scale"?(o.name==="X"&&Math.abs(j.copy(Ft).applyQuaternion(i).dot(this.eye))>.99&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="Y"&&Math.abs(j.copy(ot).applyQuaternion(i).dot(this.eye))>.99&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="Z"&&Math.abs(j.copy(Dt).applyQuaternion(i).dot(this.eye))>.99&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="XY"&&Math.abs(j.copy(Dt).applyQuaternion(i).dot(this.eye))<.2&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="YZ"&&Math.abs(j.copy(Ft).applyQuaternion(i).dot(this.eye))<.2&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="XZ"&&Math.abs(j.copy(ot).applyQuaternion(i).dot(this.eye))<.2&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1)):this.mode==="rotate"&&(ei.copy(i),j.copy(this.eye).applyQuaternion(Y.copy(i).invert()),o.name.search("E")!==-1&&o.quaternion.setFromRotationMatrix(Cs.lookAt(this.eye,ks,ot)),o.name==="X"&&(Y.setFromAxisAngle(Ft,Math.atan2(-j.y,j.z)),Y.multiplyQuaternions(ei,Y),o.quaternion.copy(Y)),o.name==="Y"&&(Y.setFromAxisAngle(ot,Math.atan2(j.x,j.z)),Y.multiplyQuaternions(ei,Y),o.quaternion.copy(Y)),o.name==="Z"&&(Y.setFromAxisAngle(Dt,Math.atan2(j.y,j.x)),Y.multiplyQuaternions(ei,Y),o.quaternion.copy(Y))),o.visible=o.visible&&(o.name.indexOf("X")===-1||this.showX),o.visible=o.visible&&(o.name.indexOf("Y")===-1||this.showY),o.visible=o.visible&&(o.name.indexOf("Z")===-1||this.showZ),o.visible=o.visible&&(o.name.indexOf("E")===-1||this.showX&&this.showY&&this.showZ),o.material._color=o.material._color||o.material.color.clone(),o.material._opacity=o.material._opacity||o.material.opacity,o.material.color.copy(o.material._color),o.material.opacity=o.material._opacity,this.enabled&&this.axis&&(o.name===this.axis||this.axis.split("").some(function(r){return o.name===r}))&&(o.material.color.setHex(16776960),o.material.opacity=1)}super.updateMatrixWorld(e)}}class Ja extends f{constructor(){super(new oi(1e5,1e5,2,2),new Ke({visible:!1,wireframe:!0,side:Hi,transparent:!0,opacity:.1,toneMapped:!1})),this.isTransformControlsPlane=!0,this.type="TransformControlsPlane"}updateMatrixWorld(e){let t=this.space;switch(this.position.copy(this.worldPosition),this.mode==="scale"&&(t="local"),ti.copy(Ft).applyQuaternion(t==="local"?this.worldQuaternion:ii),_t.copy(ot).applyQuaternion(t==="local"?this.worldQuaternion:ii),It.copy(Dt).applyQuaternion(t==="local"?this.worldQuaternion:ii),j.copy(_t),this.mode){case"translate":case"scale":switch(this.axis){case"X":j.copy(this.eye).cross(ti),Ee.copy(ti).cross(j);break;case"Y":j.copy(this.eye).cross(_t),Ee.copy(_t).cross(j);break;case"Z":j.copy(this.eye).cross(It),Ee.copy(It).cross(j);break;case"XY":Ee.copy(It);break;case"YZ":Ee.copy(ti);break;case"XZ":j.copy(It),Ee.copy(_t);break;case"XYZ":case"E":Ee.set(0,0,0);break}break;case"rotate":default:Ee.set(0,0,0)}Ee.length()===0?this.quaternion.copy(this.cameraQuaternion):(Es.lookAt(re.set(0,0,0),Ee,j),this.quaternion.setFromRotationMatrix(Es)),super.updateMatrixWorld(e)}}const Ei="tony-stonks-editor-levels",Mi="tony-stonks-editor-autosave";class Ae{static createNewLevel(e="Untitled Level"){return{id:`custom_${Date.now()}`,name:e,description:"A custom level",chapter:99,skyColor:"#87CEEB",skyColorTop:"#1e90ff",skyColorBottom:"#87CEEB",fogColor:"#a0a0a0",fogNear:30,fogFar:100,ambientLight:.5,sunIntensity:.8,groundSize:100,groundColor:"#555555",spawnPoint:{position:[0,.5,0],rotation:0},bounds:{minX:-48,maxX:48,minZ:-48,maxZ:48},objects:[],createdAt:Date.now(),updatedAt:Date.now(),version:1}}static getSavedLevels(){try{const e=localStorage.getItem(Ei);return e?JSON.parse(e):[]}catch(e){return console.error("Failed to load saved levels:",e),[]}}static saveLevel(e){try{e.updatedAt=Date.now(),e.version++;const t=this.getSavedLevels(),i=t.findIndex(s=>s.id===e.id);return i>=0?t[i]=e:t.push(e),localStorage.setItem(Ei,JSON.stringify(t)),!0}catch(t){return console.error("Failed to save level:",t),!1}}static deleteLevel(e){try{const i=this.getSavedLevels().filter(s=>s.id!==e);return localStorage.setItem(Ei,JSON.stringify(i)),!0}catch(t){return console.error("Failed to delete level:",t),!1}}static autosave(e){try{localStorage.setItem(Mi,JSON.stringify(e))}catch(t){console.error("Autosave failed:",t)}}static loadAutosave(){try{const e=localStorage.getItem(Mi);return e?JSON.parse(e):null}catch{return null}}static clearAutosave(){localStorage.removeItem(Mi)}static exportLevel(e){const t=JSON.stringify(e,null,2),i=new Blob([t],{type:"application/json"}),s=URL.createObjectURL(i),n=document.createElement("a");n.href=s,n.download=`${e.name.replace(/[^a-z0-9]/gi,"_").toLowerCase()}.json`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(s)}static async importLevel(e){return new Promise(t=>{const i=new FileReader;i.onload=s=>{try{const n=JSON.parse(s.target?.result);if(!n.objects||!Array.isArray(n.objects)){console.error("Invalid level file: missing objects array"),t(null);return}n.id=`imported_${Date.now()}`,n.createdAt=Date.now(),n.updatedAt=Date.now(),t(n)}catch(n){console.error("Failed to parse level file:",n),t(null)}},i.onerror=()=>t(null),i.readAsText(e)})}static toGameLevel(e){return{id:e.id,chapter:e.chapter,name:e.name,subtitle:"Custom Level",description:e.description,skyColor:e.skyColor,skyColorTop:e.skyColorTop,skyColorBottom:e.skyColorBottom,fogColor:e.fogColor,fogNear:e.fogNear,fogFar:e.fogFar,ambientLight:e.ambientLight,sunIntensity:e.sunIntensity,groundSize:e.groundSize,groundColor:e.groundColor,spawnPoint:e.spawnPoint,bounds:e.bounds,objects:e.objects,goals:[{type:"score",target:1e4,description:"Score 10,000 points"}],timeLimit:0}}}const Ms=[{name:"Rails & Grinds",icon:"🛤️",items:[{type:"rail",name:"Rail",description:"Standard grindable rail",icon:"━",defaultParams:{length:10}},{type:"rail_angled",name:"Angled Rail",description:"Descending grind rail",icon:"╲",defaultParams:{length:10}},{type:"rail_curved",name:"Curved Rail",description:"Curved grind rail",icon:"⌒",defaultParams:{length:10}},{type:"bench",name:"Bench",description:"Grindable park bench",icon:"🪑"}]},{name:"Ramps & Pipes",icon:"📐",items:[{type:"ramp",name:"Ramp",description:"Launch ramp",icon:"⟋"},{type:"quarter_pipe_small",name:"Quarter Pipe (S)",description:"Small curved vert ramp",icon:"⌓"},{type:"quarter_pipe_med",name:"Quarter Pipe (M)",description:"Medium curved vert ramp",icon:"⌓"},{type:"quarter_pipe_large",name:"Quarter Pipe (L)",description:"Large curved vert ramp",icon:"⌓"},{type:"half_pipe",name:"Half Pipe",description:"Full half pipe",icon:"⏜",defaultParams:{width:15,length:20}},{type:"fun_box",name:"Fun Box",description:"Flat top with rails",icon:"▭",defaultParams:{width:6,depth:4,height:.8}}]},{name:"Structures",icon:"🏢",items:[{type:"stairs",name:"Stairs",description:"Stair set",icon:"📶",defaultParams:{steps:5}},{type:"platform",name:"Platform",description:"Flat elevated platform",icon:"▬",defaultParams:{width:5,depth:5,height:1}},{type:"wall",name:"Wall",description:"Solid wall barrier",icon:"🧱",defaultParams:{width:5,height:3}}]},{name:"Office",icon:"🏢",items:[{type:"desk",name:"Desk",description:"Office desk",icon:"🪑"},{type:"cubicle",name:"Cubicle",description:"Office cubicle",icon:"📦",defaultParams:{width:3,depth:3}},{type:"water_cooler",name:"Water Cooler",description:"Office water cooler",icon:"🚰"},{type:"elevator",name:"Elevator",description:"Elevator doors",icon:"🛗"},{type:"escalator",name:"Escalator",description:"Moving stairs",icon:"📶"}]},{name:"Vehicles",icon:"🚗",items:[{type:"car",name:"Car",description:"Parked car",icon:"🚗"}]},{name:"Street Props",icon:"🌳",items:[{type:"planter",name:"Planter",description:"Planter with tree",icon:"🌳"},{type:"trash_can",name:"Trash Can",description:"Metal trash can",icon:"🗑️"},{type:"cone",name:"Traffic Cone",description:"Orange traffic cone",icon:"🔶"},{type:"barrier",name:"Barrier",description:"Safety barrier",icon:"🚧",defaultParams:{length:5}}]},{name:"Buildings",icon:"🏗️",items:[{type:"building_small",name:"Small Building",description:"Small office building",icon:"🏠",defaultParams:{width:10,depth:10,height:15}},{type:"building_medium",name:"Medium Building",description:"Medium office tower",icon:"🏢",defaultParams:{width:15,depth:15,height:30}},{type:"building_large",name:"Large Building",description:"Large skyscraper",icon:"🏙️",defaultParams:{width:20,depth:20,height:50}},{type:"building_wide",name:"Wide Building",description:"Wide commercial building",icon:"🏬",defaultParams:{width:30,depth:15,height:12}}]},{name:"Nature",icon:"🌿",items:[{type:"shrub_small",name:"Small Shrub",description:"Small decorative bush",icon:"🌱"},{type:"shrub_medium",name:"Medium Shrub",description:"Medium hedge bush",icon:"🌿"},{type:"shrub_large",name:"Large Shrub",description:"Large ornamental bush",icon:"🌳"},{type:"tree_small",name:"Small Tree",description:"Small decorative tree",icon:"🌲"}]}];class er{scene;camera;perspCamera;orthoCamera;isOrthographic=!1;renderer;orbitControls;transformControls;viewCubeContainer=null;level;objects=[];selectedObjects=[];selectedObject=null;isDragSelecting=!1;dragStartPoint=null;selectionBox=null;justFinishedDragSelect=!1;callbacks;raycaster;mouse;gridHelper;gridSnap=1;rotationSnap=15;placementMode=!1;placementItem=null;placementPreview=null;materials=new Map;groundPlane;skyGradient;spawnMarker=null;autosaveTimer=null;undoStack=[];redoStack=[];maxUndoSteps=20;currentTool="select";isPainting=!1;lastPaintPosition=null;paintMinDistance=2;toolbarContainer=null;transformStartPos=new m;transformStartRot=new ne;multiSelectOffsets=new Map;isPlacingSpawn=!1;onSpawnPlaced=null;constructor(e,t={}){this.callbacks=t,this.raycaster=new qs,this.mouse=new le,this.scene=new Vi,this.scene.background=new B(8900331),this.perspCamera=new qt(60,e.clientWidth/e.clientHeight,.1,1e3),this.perspCamera.position.set(30,30,30),this.perspCamera.lookAt(0,0,0);const i=e.clientWidth/e.clientHeight,s=50;this.orthoCamera=new qi(-s*i/2,s*i/2,s/2,-s/2,.1,1e3),this.orthoCamera.position.set(30,30,30),this.orthoCamera.lookAt(0,0,0),this.camera=this.perspCamera,this.renderer=new $i({antialias:!0}),this.renderer.setSize(e.clientWidth,e.clientHeight),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)),this.renderer.shadowMap.enabled=!0,e.appendChild(this.renderer.domElement),this.orbitControls=new Va(this.camera,this.renderer.domElement),this.orbitControls.enableDamping=!0,this.orbitControls.dampingFactor=.1,this.orbitControls.maxPolarAngle=Math.PI/2-.05,this.orbitControls.mouseButtons={LEFT:null,MIDDLE:Xe.PAN,RIGHT:Xe.ROTATE},this.orbitControls.enableZoom=!0,this.orbitControls.zoomSpeed=1.2,this.transformControls=new $a(this.camera,this.renderer.domElement),this.transformControls.addEventListener("dragging-changed",a=>{this.orbitControls.enabled=!a.value,a.value&&this.selectedObject&&(this.transformStartPos.copy(this.selectedObject.mesh.position),this.transformStartRot.copy(this.selectedObject.mesh.rotation),this.multiSelectOffsets.clear(),this.selectedObjects.forEach(r=>{r!==this.selectedObject&&this.multiSelectOffsets.set(r.id,{pos:r.mesh.position.clone().sub(this.selectedObject.mesh.position),rot:r.mesh.rotation.clone()})}))}),this.transformControls.addEventListener("objectChange",()=>{this.updateMultiSelectTransform(),this.updateSelectedObjectData()}),this.scene.add(this.transformControls),this.gridHelper=new is(100,100,4473924,8947848),this.scene.add(this.gridHelper);const n=new oi(200,200),o=new T({color:5592405,roughness:.9,metalness:.1});this.groundPlane=new f(n,o),this.groundPlane.rotation.x=-Math.PI/2,this.groundPlane.position.y=-.01,this.groundPlane.name="ground-plane",this.groundPlane.receiveShadow=!0,this.scene.add(this.groundPlane),this.skyGradient=new ln,this.scene.add(this.skyGradient.getMesh()),this.setupLights(),this.initMaterials(),this.level=Ae.createNewLevel(),this.setupEventListeners(e),window.addEventListener("resize",()=>{const a=e.clientWidth/e.clientHeight;this.perspCamera.aspect=a,this.perspCamera.updateProjectionMatrix();const r=50;this.orthoCamera.left=-r*a/2,this.orthoCamera.right=r*a/2,this.orthoCamera.top=r/2,this.orthoCamera.bottom=-r/2,this.orthoCamera.updateProjectionMatrix(),this.renderer.setSize(e.clientWidth,e.clientHeight)}),this.createViewCube(e),this.createToolbar(e),this.saveUndoState(),this.animate(),this.startAutosave()}setupLights(){const e=new li(16777215,.5);this.scene.add(e);const t=new xt(16777215,.8);t.position.set(50,100,50),t.castShadow=!0,t.shadow.mapSize.width=2048,t.shadow.mapSize.height=2048,t.shadow.camera.near=10,t.shadow.camera.far=200,t.shadow.camera.left=-50,t.shadow.camera.right=50,t.shadow.camera.top=50,t.shadow.camera.bottom=-50,this.scene.add(t)}initMaterials(){this.materials.set("rail",new T({color:13421772,metalness:.8,roughness:.2})),this.materials.set("wood",new T({color:9127187,roughness:.7})),this.materials.set("concrete",new T({color:6710886,roughness:.9})),this.materials.set("metal",new T({color:8947848,metalness:.6,roughness:.4})),this.materials.set("office",new T({color:4868702,roughness:.7})),this.materials.set("preview",new T({color:65416,transparent:!0,opacity:.6})),this.materials.set("selected",new T({color:16776960,emissive:4473856}))}setupEventListeners(e){e.addEventListener("click",t=>{if(this.justFinishedDragSelect){this.justFinishedDragSelect=!1;return}this.handleClick(t,!1)}),e.addEventListener("contextmenu",t=>{(this.currentTool==="pencil"||this.currentTool==="paint")&&(t.preventDefault(),this.handleClick(t,!0))}),e.addEventListener("mousedown",t=>{t.button===0&&this.currentTool==="paint"&&this.placementMode?(this.isPainting=!0,this.lastPaintPosition=null):t.button===2&&this.currentTool==="paint"?(this.isPainting=!0,this.lastPaintPosition=null):t.button===0&&this.currentTool==="select"&&this.startDragSelection(t,e)}),e.addEventListener("mouseup",t=>{this.isPainting&&(this.isPainting=!1,this.lastPaintPosition=null,this.currentTool==="paint"&&this.saveUndoState()),this.isDragSelecting&&this.endDragSelection(t,e)}),e.addEventListener("mouseleave",()=>{this.isDragSelecting&&this.cancelDragSelection()}),e.addEventListener("mousemove",t=>{this.handleMouseMove(t,e),this.isPainting&&this.currentTool==="paint"&&this.placementMode&&this.handlePaintStroke(t.button===2),this.isDragSelecting&&this.updateDragSelection(t,e)}),window.addEventListener("keydown",t=>{this.handleKeyDown(t)})}handleClick(e,t=!1){if(this.isPlacingSpawn){this.raycaster.setFromCamera(this.mouse,this.camera);const i=this.raycaster.intersectObject(this.groundPlane);if(i.length>0){const s=i[0].point,n=this.gridSnap>0?Math.round(s.x/this.gridSnap)*this.gridSnap:s.x,o=this.gridSnap>0?Math.round(s.z/this.gridSnap)*this.gridSnap:s.z;this.onSpawnPlaced?.(n,o),this.isPlacingSpawn=!1,this.onSpawnPlaced=null}return}this.currentTool==="select"?this.selectObjectAtMouse():(this.currentTool==="pencil"||this.currentTool==="paint")&&t?this.deleteObjectAtMouse():this.placementMode&&this.placementItem&&(this.currentTool==="pencil"||this.currentTool==="paint")?(this.placeObject(),this.saveUndoState()):(this.currentTool==="move"||this.currentTool==="rotate")&&this.selectObjectAtMouse()}handleMouseMove(e,t){const i=t.getBoundingClientRect();this.mouse.x=(e.clientX-i.left)/i.width*2-1,this.mouse.y=-((e.clientY-i.top)/i.height)*2+1,this.placementMode&&this.placementPreview&&this.updatePlacementPreview()}handleKeyDown(e){const t=e.target.tagName;if(!(t==="INPUT"||t==="TEXTAREA"))switch(e.code){case"Delete":case"Backspace":this.selectedObject&&this.deleteSelectedObject();break;case"Escape":this.placementMode?this.cancelPlacement():this.deselectObject();break;case"KeyG":this.toggleGridSnap();break;case"KeyR":this.transformControls.setMode("rotate");break;case"KeyT":this.transformControls.setMode("translate");break;case"KeyD":this.selectedObject&&(e.ctrlKey||e.metaKey)&&(e.preventDefault(),this.duplicateSelectedObject());break;case"KeyS":(e.ctrlKey||e.metaKey)&&(e.preventDefault(),this.save());break;case"KeyZ":(e.ctrlKey||e.metaKey)&&(e.preventDefault(),e.shiftKey?this.redo():this.undo());break;case"KeyY":(e.ctrlKey||e.metaKey)&&(e.preventDefault(),this.redo());break;case"BracketLeft":this.placementPreview?this.placementPreview.rotation.y-=R.degToRad(this.rotationSnap):this.selectedObject&&(this.selectedObject.mesh.rotation.y-=R.degToRad(this.rotationSnap),this.updateSelectedObjectData());break;case"BracketRight":this.placementPreview?this.placementPreview.rotation.y+=R.degToRad(this.rotationSnap):this.selectedObject&&(this.selectedObject.mesh.rotation.y+=R.degToRad(this.rotationSnap),this.updateSelectedObjectData());break}}selectObjectAtMouse(){this.raycaster.setFromCamera(this.mouse,this.camera);const e=this.objects.map(i=>i.mesh),t=this.raycaster.intersectObjects(e,!0);if(t.length>0){let i=null;for(const s of this.objects)if(this.isDescendant(t[0].object,s.mesh)){i=s;break}i&&this.selectObject(i)}else this.deselectObject()}isDescendant(e,t){let i=e;for(;i;){if(i===t)return!0;i=i.parent}return!1}selectObject(e){this.deselectObject(),this.selectedObject=e,this.transformControls.attach(e.mesh),this.callbacks.onObjectSelected?.(e)}deselectObject(){this.selectedObject&&(this.transformControls.detach(),this.selectedObject=null,this.callbacks.onObjectSelected?.(null)),this.selectedObjects.forEach(e=>{this.unhighlightObject(e)}),this.selectedObjects=[]}startDragSelection(e,t){const i=t.getBoundingClientRect();this.dragStartPoint={x:e.clientX-i.left,y:e.clientY-i.top},this.isDragSelecting=!0,this.selectionBox=document.createElement("div"),this.selectionBox.style.cssText=`
      position: absolute;
      border: 2px dashed #00ff88;
      background: rgba(0, 255, 136, 0.1);
      pointer-events: none;
      z-index: 1000;
    `,t.appendChild(this.selectionBox),this.orbitControls.enabled=!1}updateDragSelection(e,t){if(!this.selectionBox||!this.dragStartPoint)return;const i=t.getBoundingClientRect(),s=e.clientX-i.left,n=e.clientY-i.top,o=Math.min(this.dragStartPoint.x,s),a=Math.min(this.dragStartPoint.y,n),r=Math.abs(s-this.dragStartPoint.x),l=Math.abs(n-this.dragStartPoint.y);this.selectionBox.style.left=`${o}px`,this.selectionBox.style.top=`${a}px`,this.selectionBox.style.width=`${r}px`,this.selectionBox.style.height=`${l}px`}endDragSelection(e,t){if(!this.dragStartPoint)return;const i=t.getBoundingClientRect(),s=e.clientX-i.left,n=e.clientY-i.top,o=Math.min(this.dragStartPoint.x,s),a=Math.max(this.dragStartPoint.x,s),r=Math.min(this.dragStartPoint.y,n),l=Math.max(this.dragStartPoint.y,n);Math.hypot(s-this.dragStartPoint.x,n-this.dragStartPoint.y)>5?(this.justFinishedDragSelect=!0,this.deselectObject(),this.objects.forEach(c=>{const h=this.getScreenPosition(c.mesh,t);h&&h.x>=o&&h.x<=a&&h.y>=r&&h.y<=l&&(this.selectedObjects.push(c),this.highlightObject(c))}),this.selectedObjects.length>0&&(this.selectedObject=this.selectedObjects[0],this.transformControls.attach(this.selectedObject.mesh),this.callbacks.onObjectSelected?.(this.selectedObject))):this.selectObjectAtMouse(),this.cancelDragSelection()}cancelDragSelection(){this.isDragSelecting=!1,this.dragStartPoint=null,this.selectionBox&&(this.selectionBox.remove(),this.selectionBox=null),this.orbitControls.enabled=!0}getScreenPosition(e,t){const i=new m;if(e.getWorldPosition(i),i.project(this.camera),i.z>1)return null;const s=(i.x*.5+.5)*t.clientWidth,n=(-i.y*.5+.5)*t.clientHeight;return{x:s,y:n}}highlightObject(e){e.mesh.traverse(t=>{if(t instanceof f&&t.material){t.userData.originalMaterial||(t.userData.originalMaterial=t.material);const i=t.material.clone();i.emissive=new B(65416),i.emissiveIntensity=.4,i.color=new B(8978346),t.material=i}})}unhighlightObject(e){e.mesh.traverse(t=>{t instanceof f&&t.userData.originalMaterial&&(t.material=t.userData.originalMaterial,delete t.userData.originalMaterial)})}deleteSelectedObject(){if(this.selectedObjects.length>0){this.selectedObjects.forEach(i=>{this.scene.remove(i.mesh),this.unhighlightObject(i);const s=this.objects.indexOf(i);s>=0&&this.objects.splice(s,1);const n=this.level.objects.indexOf(i.data);n>=0&&this.level.objects.splice(n,1)}),this.transformControls.detach(),this.selectedObjects=[],this.selectedObject=null,this.callbacks.onObjectSelected?.(null),this.callbacks.onObjectsChanged?.(),this.saveUndoState();return}if(!this.selectedObject)return;this.scene.remove(this.selectedObject.mesh),this.transformControls.detach();const e=this.objects.indexOf(this.selectedObject);e>=0&&this.objects.splice(e,1);const t=this.level.objects.indexOf(this.selectedObject.data);t>=0&&this.level.objects.splice(t,1),this.selectedObject=null,this.callbacks.onObjectSelected?.(null),this.callbacks.onObjectsChanged?.(),this.saveUndoState()}duplicateSelectedObject(){if(this.selectedObjects.length>0){const i=[];this.selectedObjects.forEach(s=>{const n=JSON.parse(JSON.stringify(s.data));n.position[0]+=2,n.position[2]+=2;const o=this.addObject(n);i.push(o)}),this.deselectObject(),i.forEach(s=>{this.selectedObjects.push(s),this.highlightObject(s)}),i.length>0&&(this.selectedObject=i[0],this.transformControls.attach(this.selectedObject.mesh),this.callbacks.onObjectSelected?.(this.selectedObject)),this.saveUndoState();return}if(!this.selectedObject)return;const e=this.selectedObject.data,t=JSON.parse(JSON.stringify(e));t.position[0]+=2,t.position[2]+=2,this.addObject(t),this.saveUndoState()}updateMultiSelectTransform(){if(!this.selectedObject||this.selectedObjects.length<=1)return;const e=this.transformControls.getMode();if(e==="translate")this.selectedObjects.forEach(t=>{if(t!==this.selectedObject){const i=this.multiSelectOffsets.get(t.id);i&&t.mesh.position.copy(this.selectedObject.mesh.position).add(i.pos)}});else if(e==="rotate"){const t=this.selectedObject.mesh.rotation.y-this.transformStartRot.y;this.selectedObjects.forEach(i=>{if(i!==this.selectedObject){const s=this.multiSelectOffsets.get(i.id);if(s){const n=s.pos.clone(),o=Math.cos(t),a=Math.sin(t),r=n.x*o-n.z*a,l=n.x*a+n.z*o;i.mesh.position.set(this.selectedObject.mesh.position.x+r,this.selectedObject.mesh.position.y+s.pos.y,this.selectedObject.mesh.position.z+l),i.mesh.rotation.y=s.rot.y+t}}})}}updateSelectedObjectData(){if(!this.selectedObject)return;const e=this.selectedObject.mesh.position,t=this.selectedObject.mesh.rotation;this.gridSnap>0&&(e.x=Math.round(e.x/this.gridSnap)*this.gridSnap,e.z=Math.round(e.z/this.gridSnap)*this.gridSnap,this.selectedObject.mesh.position.copy(e)),this.selectedObject.data.position=[e.x,e.y,e.z],this.selectedObject.data.rotation=[R.radToDeg(t.x),R.radToDeg(t.y),R.radToDeg(t.z)],this.selectedObjects.forEach(i=>{i!==this.selectedObject&&(i.data.position=[i.mesh.position.x,i.mesh.position.y,i.mesh.position.z],i.data.rotation=[R.radToDeg(i.mesh.rotation.x),R.radToDeg(i.mesh.rotation.y),R.radToDeg(i.mesh.rotation.z)])}),this.callbacks.onObjectsChanged?.()}startPlacement(e){this.cancelPlacement(),this.placementMode=!0,this.placementItem=e,this.setTool("pencil"),this.placementPreview=this.createObjectMesh(e.type,e.defaultParams),this.placementPreview.traverse(t=>{t instanceof f&&(t.material=this.materials.get("preview").clone())}),this.scene.add(this.placementPreview),this.orbitControls.enablePan=!1}cancelPlacement(e=!0){this.placementPreview&&(this.scene.remove(this.placementPreview),this.placementPreview=null),this.placementMode=!1,this.placementItem=null,this.orbitControls.enablePan=!0,e&&this.currentTool!=="select"&&this.setTool("select")}updatePlacementPreview(){if(!this.placementPreview)return;this.raycaster.setFromCamera(this.mouse,this.camera);const e=this.raycaster.intersectObject(this.groundPlane);if(e.length>0){let t=e[0].point;this.gridSnap>0&&(t.x=Math.round(t.x/this.gridSnap)*this.gridSnap,t.z=Math.round(t.z/this.gridSnap)*this.gridSnap),this.placementPreview.position.set(t.x,0,t.z)}}placeObject(){if(!this.placementItem||!this.placementPreview||this.callbacks.canAddObject&&!this.callbacks.canAddObject())return;const e=this.placementPreview.position,t=this.placementPreview.rotation,i={type:this.placementItem.type,position:[e.x,0,e.z],rotation:[R.radToDeg(t.x),R.radToDeg(t.y),R.radToDeg(t.z)],params:this.placementItem.defaultParams?{...this.placementItem.defaultParams}:void 0};this.addObject(i),this.placementPreview.rotation.set(0,0,0)}addObject(e){this.level.objects.push(e);const t=this.createObjectMesh(e.type,e.params);t.position.set(e.position[0],e.position[1],e.position[2]),e.rotation&&t.rotation.set(R.degToRad(e.rotation[0]),R.degToRad(e.rotation[1]),R.degToRad(e.rotation[2])),this.scene.add(t);const i={id:`obj_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,mesh:t,data:e};return this.objects.push(i),this.callbacks.onObjectsChanged?.(),i}createObjectMesh(e,t){switch(e){case"rail":return this.createRailMesh(t?.length||10);case"ramp":return this.createRampMesh();case"quarter_pipe":case"quarter_pipe_small":case"quarter_pipe_med":case"quarter_pipe_large":return this.createQuarterPipeMesh();case"half_pipe":return this.createHalfPipeMesh(t);case"fun_box":return this.createFunBoxMesh(t);case"stairs":return this.createStairsMesh(t?.steps||5);case"cubicle":return this.createCubicleMesh(t);case"car":return this.createCarMesh();case"bench":return this.createBenchMesh();case"planter":return this.createPlanterMesh();case"water_cooler":return this.createWaterCoolerMesh();case"trash_can":return this.createTrashCanMesh();case"cone":return this.createConeMesh();case"barrier":return this.createBarrierMesh(t?.length||5);case"building_small":case"building_medium":case"building_large":case"building_wide":return this.createBuildingMesh(e,t);case"shrub_small":return this.createShrubMesh(.5,.6);case"shrub_medium":return this.createShrubMesh(.8,1);case"shrub_large":return this.createShrubMesh(1.2,1.5);case"tree_small":return this.createTreeMesh();default:const i=new k(1,1,1);return new f(i,this.materials.get("concrete"))}}createBuildingMesh(e,t){const i=new A,s={building_small:{width:10,depth:10,height:15},building_medium:{width:15,depth:15,height:30},building_large:{width:20,depth:20,height:50},building_wide:{width:30,depth:15,height:12}},n=s[e]||s.building_small,o=t?.width||n.width,a=t?.depth||n.depth,r=t?.height||n.height,l=new T({color:8421520,roughness:.7,metalness:.1}),d=new k(o,r,a),c=new f(d,l);c.name="Body",c.position.y=r/2,c.castShadow=!0,c.receiveShadow=!0,i.add(c);const h=new T({color:4491434,roughness:.1,metalness:.8}),u=Math.floor(r/3),y=Math.floor(o/3);for(let b=0;b<u;b++)for(let w=0;w<y;w++){const x=new k(1.5,2,.1),v=new f(x,h);v.name="Windows",v.position.set(-o/2+1.5+w*3,2+b*3,a/2+.05),i.add(v);const S=v.clone();S.name="Windows",S.position.z=-a/2-.05,i.add(S)}return i}createShrubMesh(e,t){const i=new A,s=new T({color:2263091,roughness:.8}),n=5;for(let o=0;o<n;o++){const a=e*(.6+Math.random()*.4),r=new pe(a,8,6),l=new f(r,s);l.position.set((Math.random()-.5)*e,t*.5+(Math.random()-.5)*t*.3,(Math.random()-.5)*e),l.castShadow=!0,i.add(l)}return i}createTreeMesh(){const e=new A,t=new T({color:4863784,roughness:.9}),i=new O(.15,.2,2,8),s=new f(i,t);s.name="Trunk",s.position.y=1,s.castShadow=!0,e.add(s);const n=new T({color:2972199,roughness:.8}),o=new at(1.5,3,8),a=new f(o,n);return a.name="Foliage",a.position.y=3.5,a.castShadow=!0,e.add(a),e}createRailMesh(e){const t=new A,i=this.materials.get("rail"),s=this.materials.get("metal"),n=new k(e,.08,.08),o=new f(n,i);o.position.y=.8,o.castShadow=!0,t.add(o);const a=new O(.04,.04,.8);for(const r of[-1,1]){const l=new f(a,s);l.position.set(r*(e/2-.2),.4,0),l.castShadow=!0,t.add(l)}return t}createRampMesh(){const e=new A,t=this.materials.get("wood"),i=new k(4,.15,3),s=new f(i,t);s.position.set(0,.6,0),s.rotation.x=-Math.PI/8,s.castShadow=!0,e.add(s);const n=new k(.1,.8,3.2);for(const o of[-1,1]){const a=new f(n,t);a.position.set(o*2,.4,0),e.add(a)}return e}createQuarterPipeMesh(){const e=this.materials.get("concrete"),t=new Bt,i=4,s=16;t.moveTo(0,0);for(let a=0;a<=s;a++){const r=a/s*Math.PI/2;t.lineTo(i-Math.cos(r)*i,Math.sin(r)*i)}t.lineTo(i,0),t.lineTo(0,0);const n=new Nt(t,{steps:1,depth:10,bevelEnabled:!1}),o=new f(n,e);return o.castShadow=!0,o.receiveShadow=!0,o}createHalfPipeMesh(e){const t=e?.width||15,i=e?.length||20,s=this.materials.get("concrete"),n=new A,o=new Bt,a=4,r=16;o.moveTo(0,0);for(let y=0;y<=r;y++){const b=y/r*Math.PI/2;o.lineTo(a-Math.cos(b)*a,Math.sin(b)*a)}o.lineTo(a,0),o.lineTo(0,0);const l=new Nt(o,{steps:1,depth:i,bevelEnabled:!1}),d=new f(l,s);d.position.set(-t/2,0,-i/2),d.rotation.y=Math.PI/2,n.add(d);const c=new f(l,s);c.position.set(t/2,0,i/2),c.rotation.y=-Math.PI/2,n.add(c);const h=new k(t-8,.1,i),u=new f(h,s);return u.position.set(0,.05,0),n.add(u),n}createFunBoxMesh(e){const t=e?.width||6,i=e?.depth||4,s=e?.height||.8,n=new A,o=this.materials.get("concrete"),a=this.materials.get("rail"),r=new k(t,s,i),l=new f(r,o);l.position.y=s/2,l.castShadow=!0,n.add(l);const d=new k(t,.06,.06);for(const c of[-1,1]){const h=new f(d,a);h.position.set(0,s+.03,c*(i/2-.03)),n.add(h)}return n}createStairsMesh(e){const t=new A,i=this.materials.get("concrete"),s=4,n=.2,o=.3;for(let a=0;a<e;a++){const r=new k(s,n,o),l=new f(r,i);l.position.set(0,n/2+a*n,a*o),l.castShadow=!0,t.add(l)}return t}createCubicleMesh(e){const t=e?.width||3,i=e?.depth||3,s=1.5,n=new A,o=this.materials.get("office"),a=this.materials.get("wood"),r=new k(t,s,.05),l=new f(r,o);l.position.set(0,s/2,i/2),n.add(l);const d=new k(.05,s,i);for(const u of[-1,1]){const y=new f(d,o);y.position.set(u*t/2,s/2,0),n.add(y)}const c=new k(t*.8,.05,i*.4),h=new f(c,a);return h.position.set(0,.75,i*.2),n.add(h),n}createCarMesh(){const e=new A,t=new T({color:2245802,metalness:.8,roughness:.3}),i=new T({color:2236962}),s=new k(2,1,4),n=new f(s,t);n.name="Body",n.position.y=.8,n.castShadow=!0,e.add(n);const o=new k(1.5,.6,2),a=new f(o,t);a.name="Body",a.position.set(0,1.6,-.3),e.add(a);const r=new O(.3,.3,.15,12),l=[[-.9,.3,1.3],[.9,.3,1.3],[-.9,.3,-1.3],[.9,.3,-1.3]];for(const[d,c,h]of l){const u=new f(r,i);u.name="Wheels",u.position.set(d,c,h),u.rotation.z=Math.PI/2,e.add(u)}return e}createBenchMesh(){const e=new A,t=this.materials.get("wood"),i=this.materials.get("metal"),s=new k(2,.1,.5),n=new f(s,t);n.position.y=.5,e.add(n);const o=new k(.1,.5,.4);for(const a of[-.8,.8]){const r=new f(o,i);r.position.set(a,.25,0),e.add(r)}return e}createPlanterMesh(){const e=new A,t=new k(2,.8,2),i=new T({color:8947848}),s=new f(t,i);s.name="Pot",s.position.y=.4,e.add(s);const n=new O(.1,.15,1),o=new T({color:4861984}),a=new f(n,o);a.name="Trunk",a.position.y=1.3,e.add(a);const r=new pe(.6,8,8),l=new T({color:2263842}),d=new f(r,l);return d.name="Foliage",d.position.y=2,e.add(d),e}createWaterCoolerMesh(){const e=new A,t=new O(.2,.25,1,12),i=new T({color:6719658}),s=new f(t,i);s.name="Body",s.position.y=.5,e.add(s);const n=new O(.15,.18,.4,12),o=new T({color:8965375,transparent:!0,opacity:.6}),a=new f(n,o);return a.name="Jug",a.position.y=1.2,e.add(a),e}createTrashCanMesh(){const e=new O(.25,.2,.6,12),t=this.materials.get("metal"),i=new f(e,t);return i.position.y=.3,i}createConeMesh(){const e=new at(.2,.5,8),t=new T({color:16737792}),i=new f(e,t);return i.position.y=.25,i}createBarrierMesh(e){const t=new A,i=new k(e,.8,.1),s=new T({color:16763904}),n=new f(i,s);n.position.y=.5,t.add(n);const o=new O(.05,.05,.8),a=this.materials.get("metal");for(const r of[-1,1]){const l=new f(o,a);l.position.set(r*(e/2-.1),.4,0),t.add(l)}return t}updateSpawnMarker(){this.spawnMarker&&this.scene.remove(this.spawnMarker);const e=new A,t=new Ke({color:65280}),i=new O(.3,.3,.1,8),s=new f(i,t);s.rotation.x=Math.PI/2,e.add(s);const n=new at(.5,.5,8),o=new f(n,t);o.rotation.x=-Math.PI/2,o.position.z=.5,e.add(o);const a=new O(.05,.05,2),r=new f(a,t);r.position.y=1,e.add(r);const l=this.level.spawnPoint;e.position.set(l.position[0],.5,l.position[2]),e.rotation.y=R.degToRad(l.rotation),this.spawnMarker=e,this.scene.add(e)}setSpawnPoint(e,t,i){this.level.spawnPoint={position:[e,.5,t],rotation:i},this.updateSpawnMarker(),this.callbacks.onLevelChanged?.()}startSpawnPlacement(e){this.isPlacingSpawn=!0,this.onSpawnPlaced=e,this.cancelPlacement(),this.deselectObject()}newLevel(){this.clearLevel(),this.level=Ae.createNewLevel(),this.updateEnvironment(),this.updateSpawnMarker(),this.callbacks.onLevelChanged?.()}loadLevel(e){this.clearLevel(),this.level=e;for(const t of e.objects){const i=this.createObjectMesh(t.type,t.params);i.position.set(t.position[0],t.position[1],t.position[2]),t.rotation&&i.rotation.set(R.degToRad(t.rotation[0]),R.degToRad(t.rotation[1]),R.degToRad(t.rotation[2])),this.scene.add(i),this.objects.push({id:`obj_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,mesh:i,data:t})}this.updateEnvironment(),this.updateSpawnMarker(),this.callbacks.onLevelChanged?.()}clearLevel(){this.deselectObject(),this.cancelPlacement();for(const e of this.objects)this.scene.remove(e.mesh);this.objects=[],this.spawnMarker&&(this.scene.remove(this.spawnMarker),this.spawnMarker=null)}updateEnvironment(){const e=this.level.skyColorTop||this.level.skyColor||"#1e90ff",t=this.level.skyColorBottom||this.level.skyColor||"#87ceeb";this.skyGradient.setColors(e,t),this.scene.background=null,this.scene.remove(this.gridHelper),this.gridHelper=new is(this.level.groundSize,this.level.groundSize,4473924,8947848),this.scene.add(this.gridHelper),this.groundPlane.material.color.set(this.level.groundColor),this.groundPlane.scale.set(this.level.groundSize/200,this.level.groundSize/200,1)}save(){return Ae.saveLevel(this.level)}exportLevel(){Ae.exportLevel(this.level)}async importLevel(e){const t=await Ae.importLevel(e);return t?(this.loadLevel(t),!0):!1}getLevel(){return this.level}setLevelProperty(e,t){this.level[e]=t,["skyColor","skyColorTop","skyColorBottom","groundColor","groundSize"].includes(e)&&this.updateEnvironment(),this.callbacks.onLevelChanged?.()}getSelectedObject(){return this.selectedObject}getSelectedObjects(){return this.selectedObjects}getSelectionCount(){return this.selectedObjects.length>0?this.selectedObjects.length:this.selectedObject?1:0}setGridSnap(e){this.gridSnap=e}toggleGridSnap(){this.gridSnap=this.gridSnap>0?0:1}setShowGrid(e){this.gridHelper.visible=e}setSkyboxTexture(e){new vt().load(e,i=>{i.mapping=Bs,i.colorSpace=ue,this.scene.background=i,this.level.skyboxUrl=e,this.callbacks.onLevelChanged?.()})}removeSkybox(){this.scene.background=new B(this.level.skyColor||8900331),this.level.skyboxUrl=void 0,this.callbacks.onLevelChanged?.()}setGroundTexture(e){new vt().load(e,i=>{i.wrapS=me,i.wrapT=me,i.repeat.set(20,20),i.colorSpace=ue;const s=this.groundPlane.material;s.map&&s.map.dispose(),s.map=i,s.color.setHex(16777215),s.needsUpdate=!0,this.level.groundTextureUrl=e,this.callbacks.onLevelChanged?.()})}removeGroundTexture(){const e=this.groundPlane.material;e.map&&(e.map.dispose(),e.map=null);const t=this.level.groundColor?parseInt(this.level.groundColor.replace("#",""),16):2263842;e.color.setHex(t),e.needsUpdate=!0,this.level.groundTextureUrl=void 0,this.callbacks.onLevelChanged?.()}startAutosave(){this.autosaveTimer=window.setInterval(()=>{Ae.autosave(this.level)},3e4)}saveUndoState(){const e=JSON.stringify(this.level.objects);this.undoStack.length>0&&this.undoStack[this.undoStack.length-1]===e||(this.undoStack.push(e),this.undoStack.length>this.maxUndoSteps&&this.undoStack.shift(),this.redoStack=[],this.updateUndoRedoButtons())}undo(){if(this.undoStack.length<=1)return;const e=this.undoStack.pop();this.redoStack.push(e);const t=this.undoStack[this.undoStack.length-1];this.restoreState(t),this.updateUndoRedoButtons()}redo(){if(this.redoStack.length===0)return;const e=this.redoStack.pop();this.undoStack.push(e),this.restoreState(e),this.updateUndoRedoButtons()}restoreState(e){this.objects.forEach(i=>{this.scene.remove(i.mesh)}),this.objects=[],this.deselectObject();const t=JSON.parse(e);this.level.objects=t,t.forEach(i=>{const s=this.createObjectMesh(i.type,i.params);if(s){s.position.set(...i.position),i.rotation&&s.rotation.set(R.degToRad(i.rotation[0]),R.degToRad(i.rotation[1]),R.degToRad(i.rotation[2])),i.scale&&s.scale.set(...i.scale);const n={id:`obj_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,mesh:s,data:i};this.objects.push(n),this.scene.add(s)}}),this.callbacks.onObjectsChanged?.()}updateUndoRedoButtons(){const e=this.toolbarContainer?.querySelector("#undo-btn"),t=this.toolbarContainer?.querySelector("#redo-btn");e&&(e.disabled=this.undoStack.length<=1),t&&(t.disabled=this.redoStack.length===0)}createToolbar(e){this.toolbarContainer=document.createElement("div"),this.toolbarContainer.id="editor-toolbar",this.toolbarContainer.style.cssText=`
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 5px;
      padding: 8px;
      background: rgba(0,0,0,0.7);
      border-radius: 8px;
      z-index: 100;
      font-family: 'Kanit', sans-serif;
    `;const t=[{id:"select",icon:"🖱️",label:"Select",key:"V"},{id:"move",icon:"✥",label:"Move",key:"G"},{id:"rotate",icon:"↻",label:"Rotate",key:"R"},{id:"pencil",icon:"✏️",label:"Pencil",key:"P"},{id:"paint",icon:"🖌️",label:"Paint",key:"B"}],i=this.createToolbarButton("undo-btn","↩️","Undo (Ctrl+Z)",()=>this.undo()),s=this.createToolbarButton("redo-btn","↪️","Redo (Ctrl+Y)",()=>this.redo());this.toolbarContainer.appendChild(i),this.toolbarContainer.appendChild(s);const n=document.createElement("div");n.style.cssText="width: 2px; background: #555; margin: 0 5px;",this.toolbarContainer.appendChild(n),t.forEach(o=>{const a=this.createToolbarButton(`tool-${o.id}`,o.icon,`${o.label} (${o.key})`,()=>this.setTool(o.id));a.classList.add("tool-btn"),o.id===this.currentTool&&(a.style.background="#0a0",a.style.borderColor="#0f0"),this.toolbarContainer.appendChild(a)}),e.appendChild(this.toolbarContainer),this.updateUndoRedoButtons()}createToolbarButton(e,t,i,s){const n=document.createElement("button");return n.id=e,n.textContent=t,n.title=i,n.style.cssText=`
      width: 36px;
      height: 36px;
      font-size: 18px;
      background: #333;
      color: #fff;
      border: 2px solid #555;
      border-radius: 4px;
      cursor: pointer;
    `,n.onclick=s,n.onmouseenter=()=>{n.classList.contains("active")||(n.style.background="#444")},n.onmouseleave=()=>{n.classList.contains("active")||(n.style.background="#333")},n}setTool(e){this.currentTool=e,(e==="select"||e==="move"||e==="rotate")&&this.placementMode&&this.cancelPlacement(!1),this.toolbarContainer?.querySelectorAll(".tool-btn").forEach(t=>{const i=t.id===`tool-${e}`;t.style.background=i?"#0a0":"#333",t.style.borderColor=i?"#0f0":"#555",t.classList.toggle("active",i)}),e==="move"?(this.transformControls.setMode("translate"),this.transformControls.enabled=!0):e==="rotate"?(this.transformControls.setMode("rotate"),this.transformControls.enabled=!0):this.transformControls.enabled=e==="select",this.orbitControls.enableRotate=e==="select",this.orbitControls.enablePan=e==="select"}handlePaintStroke(e){if(!this.placementMode||!this.placementItem)return;this.raycaster.setFromCamera(this.mouse,this.camera);const t=this.raycaster.intersectObject(this.groundPlane);if(t.length>0){const i=t[0].point;if(this.lastPaintPosition&&i.distanceTo(this.lastPaintPosition)<this.paintMinDistance)return;e?this.deleteObjectAtMouse():this.placeObject(),this.lastPaintPosition=i.clone()}}deleteObjectAtMouse(){this.raycaster.setFromCamera(this.mouse,this.camera);const e=this.objects.map(i=>i.mesh),t=this.raycaster.intersectObjects(e,!0);if(t.length>0){let i=t[0].object;for(;i.parent&&!this.objects.find(n=>n.mesh===i);)i=i.parent;const s=this.objects.find(n=>n.mesh===i);if(s){this.scene.remove(s.mesh),this.objects=this.objects.filter(o=>o!==s);const n=this.level.objects.indexOf(s.data);n>=0&&this.level.objects.splice(n,1),this.callbacks.onObjectsChanged?.(),this.saveUndoState()}}}toggleCameraMode(){this.isOrthographic=!this.isOrthographic;const e=this.camera.position.clone(),t=this.orbitControls.target.clone();this.camera=this.isOrthographic?this.orthoCamera:this.perspCamera,this.camera.position.copy(e),this.camera.lookAt(t),this.orbitControls.object=this.camera,this.transformControls.camera=this.camera;const i=this.viewCubeContainer?.querySelector("#camera-mode-btn");return i&&(i.textContent=this.isOrthographic?"ORTHO":"PERSP"),this.isOrthographic}snapToView(e){const i=this.orbitControls.target.clone(),n={top:new m(i.x,i.y+50,i.z),bottom:new m(i.x,i.y-50,i.z),front:new m(i.x,i.y,i.z+50),back:new m(i.x,i.y,i.z-50),left:new m(i.x-50,i.y,i.z),right:new m(i.x+50,i.y,i.z)}[e];if(n){const o=this.camera.position.clone(),a=300,r=performance.now(),l=()=>{const d=performance.now()-r,c=Math.min(d/a,1),h=1-Math.pow(1-c,3);this.camera.position.lerpVectors(o,n,h),this.camera.lookAt(i),c<1&&requestAnimationFrame(l)};l()}}createViewCube(e){this.viewCubeContainer=document.createElement("div"),this.viewCubeContainer.id="view-cube",this.viewCubeContainer.style.cssText=`
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      z-index: 100;
      font-family: 'Kanit', sans-serif;
    `;const t=document.createElement("button");t.id="camera-mode-btn",t.textContent="PERSP",t.style.cssText=`
      padding: 8px 12px;
      font-size: 12px;
      font-weight: bold;
      background: #333;
      color: #0f0;
      border: 2px solid #0f0;
      border-radius: 4px;
      cursor: pointer;
    `,t.onclick=()=>this.toggleCameraMode(),this.viewCubeContainer.appendChild(t);const i=document.createElement("div");i.style.cssText=`
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 2px;
      width: 90px;
      height: 90px;
      background: rgba(0,0,0,0.5);
      padding: 5px;
      border-radius: 4px;
    `,[{label:"",view:null},{label:"T",view:"top"},{label:"",view:null},{label:"L",view:"left"},{label:"F",view:"front"},{label:"R",view:"right"},{label:"Bk",view:"back"},{label:"B",view:"bottom"},{label:"",view:null}].forEach(({label:n,view:o})=>{const a=document.createElement("button");a.textContent=n,a.style.cssText=`
        width: 26px;
        height: 26px;
        font-size: 10px;
        font-weight: bold;
        background: ${o?"#444":"transparent"};
        color: #fff;
        border: ${o?"1px solid #666":"none"};
        border-radius: 3px;
        cursor: ${o?"pointer":"default"};
      `,o&&(a.onclick=()=>this.snapToView(o),a.onmouseenter=()=>a.style.background="#0a0",a.onmouseleave=()=>a.style.background="#444"),i.appendChild(a)}),this.viewCubeContainer.appendChild(i),e.appendChild(this.viewCubeContainer)}animate=()=>{requestAnimationFrame(this.animate),this.orbitControls.update(),this.skyGradient&&this.skyGradient.update(this.camera.position),this.renderer.render(this.scene,this.camera)};dispose(){this.autosaveTimer&&clearInterval(this.autosaveTimer),this.viewCubeContainer&&this.viewCubeContainer.remove(),this.toolbarContainer&&this.toolbarContainer.remove(),this.renderer.dispose(),this.orbitControls.dispose(),this.transformControls.dispose()}}const Ve="tony-stonks-generated-textures",As="tony-stonks-texture-gen-config";class tr{config=null;constructor(){this.loadConfig()}loadConfig(){try{const e=localStorage.getItem(As);e&&(this.config=JSON.parse(e))}catch{console.warn("Failed to load texture generator config")}}saveConfig(e){this.config=e,localStorage.setItem(As,JSON.stringify(e))}getConfig(){return this.config}isConfigured(){return this.config!==null&&this.config.apiKey.length>0}async generate(e){if(!this.config)throw new Error("Texture generator not configured. Please set up API key.");const t=e.width||512,i=e.height||512;let s=e.prompt;switch(e.seamless!==!1&&(s=`seamless tileable texture of ${s}, repeating pattern, no borders`),e.style){case"realistic":s+=", photorealistic, high detail, 4k texture";break;case"stylized":s+=", stylized, game art style, vibrant colors";break;case"pixel":s+=", pixel art, retro game style, 16-bit";break;case"painterly":s+=", hand-painted, artistic, brush strokes";break}let n;switch(this.config.provider){case"replicate":n=await this.generateWithReplicate(s,t,i);break;case"openai":n=await this.generateWithOpenAI(s,t,i);break;case"stability":n=await this.generateWithStability(s,t,i);break;default:throw new Error(`Unknown provider: ${this.config.provider}`)}let o=n;if(!n.startsWith("data:"))try{o=await this.urlToDataUrl(n)}catch(r){console.warn("Could not convert to data URL, using original:",r)}const a={url:o,prompt:e.prompt,timestamp:Date.now(),width:t,height:i};return this.saveToHistory(a),a}async generateWithReplicate(e,t,i){const s=await fetch("https://api.replicate.com/v1/predictions",{method:"POST",headers:{Authorization:`Token ${this.config.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({version:"ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4",input:{prompt:e,width:t,height:i,num_outputs:1,scheduler:"K_EULER",num_inference_steps:25,guidance_scale:7.5}})});if(!s.ok){const a=await s.json();throw new Error(a.detail||"Replicate API error")}const n=await s.json(),o=await this.pollReplicate(n.id);if(o.status==="failed")throw new Error(o.error||"Generation failed");return o.output[0]}async pollReplicate(e){for(let i=0;i<60;i++){await new Promise(o=>setTimeout(o,2e3));const n=await(await fetch(`https://api.replicate.com/v1/predictions/${e}`,{headers:{Authorization:`Token ${this.config.apiKey}`}})).json();if(n.status==="succeeded"||n.status==="failed")return n}throw new Error("Generation timed out")}async generateWithOpenAI(e,t,i){const n=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{Authorization:`Bearer ${this.config.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"dall-e-3",prompt:e,n:1,size:"1024x1024",quality:"standard",response_format:"b64_json"})});if(!n.ok){const a=await n.json();throw new Error(a.error?.message||"OpenAI API error")}return`data:image/png;base64,${(await n.json()).data[0].b64_json}`}async generateWithStability(e,t,i){const s=await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",{method:"POST",headers:{Authorization:`Bearer ${this.config.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({text_prompts:[{text:e,weight:1}],cfg_scale:7,width:t,height:i,steps:30,samples:1})});if(!s.ok){const a=await s.json();throw new Error(a.message||"Stability API error")}return`data:image/png;base64,${(await s.json()).artifacts[0].base64}`}saveToHistory(e){try{const t=this.getHistory();t.unshift(e);const i=t.slice(0,15);try{localStorage.setItem(Ve,JSON.stringify(i))}catch{console.warn("localStorage quota exceeded, trimming texture history...");for(let n=10;n>=1;n--)try{const o=i.slice(0,n);localStorage.setItem(Ve,JSON.stringify(o)),console.log(`Texture history reduced to ${n} items`);return}catch{continue}console.warn("Clearing old textures to make room"),localStorage.removeItem(Ve);try{localStorage.setItem(Ve,JSON.stringify([e]))}catch{console.error("Cannot save texture - localStorage completely full")}}}catch(t){console.warn("Failed to save texture to history:",t)}}getHistory(){try{const e=localStorage.getItem(Ve);return e?JSON.parse(e):[]}catch{return[]}}clearHistory(){localStorage.removeItem(Ve)}deleteFromHistory(e){const t=this.getHistory();e>=0&&e<t.length&&(t.splice(e,1),localStorage.setItem(Ve,JSON.stringify(t)))}async downloadTexture(e,t){const i=t||`texture_${e.timestamp}.png`;try{let s;if(e.url.startsWith("data:")){const a=await(await fetch(e.url)).blob();s=URL.createObjectURL(a)}else try{const a=await(await fetch(e.url)).blob();s=URL.createObjectURL(a)}catch{window.open(e.url,"_blank");return}const n=document.createElement("a");n.href=s,n.download=i,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(s)}catch(s){console.error("Download failed:",s),window.open(e.url,"_blank")}}async urlToDataUrl(e){if(e.startsWith("data:"))return e;const i=await(await fetch(e)).blob();return new Promise((s,n)=>{const o=new FileReader;o.onload=()=>s(o.result),o.onerror=n,o.readAsDataURL(i)})}exportTexturePack(e="texture-pack"){const t=this.getHistory(),i={name:e,version:1,exportedAt:Date.now(),textures:t},s=JSON.stringify(i,null,2),n=new Blob([s],{type:"application/json"}),o=URL.createObjectURL(n),a=document.createElement("a");a.href=o,a.download=`${e}.textures.json`,document.body.appendChild(a),a.click(),document.body.removeChild(a),URL.revokeObjectURL(o)}async importTexturePack(e){const t=await e.text(),i=JSON.parse(t);if(!i.textures||!Array.isArray(i.textures))throw new Error("Invalid texture pack format");const s=this.getHistory(),n=new Set(s.map(a=>a.timestamp));let o=0;for(const a of i.textures)n.has(a.timestamp)||(s.push(a),o++);return s.sort((a,r)=>r.timestamp-a.timestamp),localStorage.setItem(Ve,JSON.stringify(s.slice(0,100))),o}getLevelTextures(e){const t=new Set,i=[];return e.forEach(s=>{if(s.params?.textureUrl&&!t.has(s.params.textureUrl)){t.add(s.params.textureUrl);const o=this.getHistory().find(a=>a.url===s.params.textureUrl);o?i.push(o):i.push({url:s.params.textureUrl,prompt:"Unknown",timestamp:Date.now(),width:512,height:512})}}),i}}const se=new tr;class ir{container;modal=null;callbacks;selectedObject=null;textureLoader;isGenerating=!1;groundMode=!1;constructor(e,t={}){this.container=e,this.callbacks=t,this.textureLoader=new vt,this.injectStyles()}injectStyles(){if(document.getElementById("texture-gen-styles"))return;const e=document.createElement("style");e.id="texture-gen-styles",e.textContent=`
      .texture-gen-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        font-family: 'Kanit', sans-serif;
      }
      
      .texture-gen-content {
        width: 700px;
        max-width: 95vw;
        max-height: 90vh;
        background: #1a1a2e;
        border: 2px solid #4a4a7e;
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      
      .texture-gen-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 20px;
        background: #2a2a4e;
        border-bottom: 1px solid #3a3a6e;
      }
      
      .texture-gen-header h2 {
        margin: 0;
        font-size: 18px;
        color: #fff;
      }
      
      .texture-gen-close {
        background: transparent;
        border: none;
        color: #888;
        font-size: 24px;
        cursor: pointer;
        padding: 0 5px;
      }
      
      .texture-gen-close:hover {
        color: #fff;
      }
      
      .texture-gen-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      
      .texture-gen-section {
        margin-bottom: 20px;
      }
      
      .texture-gen-section h3 {
        font-size: 14px;
        color: #888;
        margin: 0 0 10px 0;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      .texture-gen-input {
        width: 100%;
        padding: 12px 15px;
        font-size: 14px;
        font-family: inherit;
        color: #fff;
        background: #22223a;
        border: 1px solid #3a3a6e;
        border-radius: 6px;
        box-sizing: border-box;
        resize: none;
      }
      
      .texture-gen-input:focus {
        outline: none;
        border-color: #5a9a5a;
      }
      
      .texture-gen-options {
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
      }
      
      .texture-gen-option {
        flex: 1;
        min-width: 120px;
      }
      
      .texture-gen-option label {
        display: block;
        font-size: 12px;
        color: #888;
        margin-bottom: 5px;
      }
      
      .texture-gen-option select,
      .texture-gen-option input {
        width: 100%;
        padding: 8px 10px;
        font-size: 13px;
        font-family: inherit;
        color: #fff;
        background: #22223a;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
      }
      
      .texture-gen-btn {
        padding: 12px 24px;
        font-size: 14px;
        font-family: inherit;
        font-weight: 600;
        color: #fff;
        background: linear-gradient(135deg, #4a7a4a, #3a5a3a);
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .texture-gen-btn:hover {
        background: linear-gradient(135deg, #5a9a5a, #4a7a4a);
        transform: translateY(-1px);
      }
      
      .texture-gen-btn:disabled {
        background: #3a3a5e;
        cursor: not-allowed;
        transform: none;
      }
      
      .texture-gen-btn.secondary {
        background: #3a3a5e;
      }
      
      .texture-gen-btn.secondary:hover {
        background: #4a4a7e;
      }
      
      .texture-gen-preview {
        display: flex;
        gap: 20px;
        margin-top: 15px;
      }
      
      .texture-gen-preview-box {
        width: 200px;
        height: 200px;
        background: #22223a;
        border: 2px dashed #3a3a6e;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        font-size: 13px;
        overflow: hidden;
      }
      
      .texture-gen-preview-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .texture-gen-preview-actions {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .texture-gen-history {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 10px;
        max-height: 200px;
        overflow-y: auto;
        padding: 5px;
      }
      
      .texture-gen-history-item {
        aspect-ratio: 1;
        border-radius: 6px;
        overflow: hidden;
        cursor: pointer;
        border: 2px solid transparent;
        transition: all 0.15s;
      }
      
      .texture-gen-history-item:hover {
        border-color: #5a9a5a;
        transform: scale(1.05);
      }
      
      .texture-gen-history-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .texture-gen-history-item .delete-btn {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 20px;
        height: 20px;
        background: rgba(200, 50, 50, 0.9);
        border: none;
        border-radius: 50%;
        color: white;
        font-size: 12px;
        cursor: pointer;
        display: none;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      
      .texture-gen-history-item:hover .delete-btn {
        display: flex;
      }
      
      .texture-gen-history-item {
        position: relative;
      }
      
      .texture-gen-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 15px;
        background: #2a2a4e;
        border-radius: 6px;
        margin-top: 15px;
      }
      
      .texture-gen-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid #3a3a6e;
        border-top-color: #5a9a5a;
        border-radius: 50%;
        animation: texture-spin 1s linear infinite;
      }
      
      @keyframes texture-spin {
        to { transform: rotate(360deg); }
      }
      
      .texture-gen-config {
        padding: 15px;
        background: #22223a;
        border-radius: 6px;
        margin-bottom: 20px;
      }
      
      .texture-gen-config-row {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
      }
      
      .texture-gen-config-row:last-child {
        margin-bottom: 0;
      }
      
      .texture-gen-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      
      .texture-gen-preset {
        padding: 6px 12px;
        font-size: 12px;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .texture-gen-preset:hover {
        background: #3a3a5e;
        border-color: #5a5a8e;
      }
      
      .texture-gen-error {
        padding: 12px 15px;
        background: #5a3a3a;
        border: 1px solid #7a4a4a;
        border-radius: 6px;
        color: #ff8888;
        margin-top: 10px;
      }

      .texture-gen-tabs {
        display: flex;
        gap: 5px;
        margin-bottom: 15px;
        border-bottom: 1px solid #3a3a6e;
        padding-bottom: 10px;
      }

      .texture-gen-tab {
        padding: 8px 16px;
        font-size: 13px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px 4px 0 0;
        color: #888;
        cursor: pointer;
        transition: all 0.15s;
      }

      .texture-gen-tab:hover {
        color: #fff;
      }

      .texture-gen-tab.active {
        background: #2a2a4e;
        border-color: #3a3a6e;
        border-bottom-color: transparent;
        color: #fff;
      }

      .texture-gen-tab-content {
        display: none;
      }

      .texture-gen-tab-content.active {
        display: block;
      }
    `,document.head.appendChild(e)}show(e=null){this.selectedObject=e,this.groundMode=!1,this.modal&&this.modal.remove(),this.modal=document.createElement("div"),this.modal.className="texture-gen-modal",this.modal.innerHTML=this.getModalHTML(),this.container.appendChild(this.modal),this.setupEventListeners(),this.updateHistoryDisplay(),se.isConfigured()||this.showConfigSection()}setGroundMode(e){if(this.groundMode=e,this.modal){const t=this.modal.querySelector("#apply-btn");t&&(t.disabled=!1,t.textContent=e?"✓ Apply to Ground":this.selectedObject?"✓ Apply to Selected Object":"⚠️ No Object Selected")}}hide(){this.modal&&(this.modal.remove(),this.modal=null)}getModalHTML(){const e=se.getConfig(),t=this.selectedObject!==null;return`
      <div class="texture-gen-content">
        <div class="texture-gen-header">
          <h2>🎨 AI Texture Generator</h2>
          <button class="texture-gen-close">✕</button>
        </div>
        
        <div class="texture-gen-body">
          <!-- Config Section -->
          <div class="texture-gen-section texture-gen-config" id="config-section" style="display: ${e?"none":"block"}">
            <h3>⚙️ API Configuration</h3>
            <p style="color: #888; font-size: 13px; margin-bottom: 15px;">
              Configure your AI provider to generate textures. Get an API key from your preferred provider.
            </p>
            <div class="texture-gen-config-row">
              <div class="texture-gen-option" style="flex: 1;">
                <label>Provider</label>
                <select id="config-provider">
                  <option value="replicate" ${e?.provider==="replicate"?"selected":""}>Replicate (Stable Diffusion)</option>
                  <option value="openai" ${e?.provider==="openai"?"selected":""}>OpenAI (DALL-E 3)</option>
                  <option value="stability" ${e?.provider==="stability"?"selected":""}>Stability AI</option>
                </select>
              </div>
            </div>
            <div class="texture-gen-config-row">
              <div class="texture-gen-option" style="flex: 1;">
                <label>API Key</label>
                <input type="password" id="config-api-key" placeholder="Enter your API key..." value="${e?.apiKey||""}">
              </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
              <button class="texture-gen-btn" id="save-config-btn">Save Configuration</button>
              ${e?'<button class="texture-gen-btn secondary" id="cancel-config-btn">Cancel</button>':""}
            </div>
          </div>
          
          <!-- Main Generator Section -->
          <div id="generator-section" style="display: ${e?"block":"none"}">
            <!-- Tabs -->
            <div class="texture-gen-tabs">
              <button class="texture-gen-tab active" data-tab="generate">Generate New</button>
              <button class="texture-gen-tab" data-tab="skybox">🌅 Skybox</button>
              <button class="texture-gen-tab" data-tab="history">History</button>
              <button class="texture-gen-tab" data-tab="settings">Settings</button>
            </div>

            <!-- Generate Tab -->
            <div class="texture-gen-tab-content active" id="tab-generate">
              <div class="texture-gen-section">
                <h3>Describe Your Texture</h3>
                <textarea class="texture-gen-input" id="texture-prompt" rows="3" 
                  placeholder="e.g., rusty metal plates, cracked concrete, wooden planks, grass lawn, brick wall..."></textarea>
                
                <div class="texture-gen-presets">
                  <span style="color: #666; font-size: 12px; margin-right: 5px;">Quick:</span>
                  <button class="texture-gen-preset" data-prompt="concrete with cracks and stains">Concrete</button>
                  <button class="texture-gen-preset" data-prompt="rusty corrugated metal">Rusty Metal</button>
                  <button class="texture-gen-preset" data-prompt="wooden planks with grain">Wood</button>
                  <button class="texture-gen-preset" data-prompt="red brick wall">Brick</button>
                  <button class="texture-gen-preset" data-prompt="green grass lawn">Grass</button>
                  <button class="texture-gen-preset" data-prompt="sandy desert ground">Sand</button>
                  <button class="texture-gen-preset" data-prompt="marble stone floor">Marble</button>
                  <button class="texture-gen-preset" data-prompt="office carpet tiles">Carpet</button>
                  <button class="texture-gen-preset" data-prompt="asphalt road with cracks">Asphalt</button>
                  <button class="texture-gen-preset" data-prompt="graffiti covered wall">Graffiti</button>
                </div>
              </div>
              
              <div class="texture-gen-section">
                <h3>Options</h3>
                <div class="texture-gen-options">
                  <div class="texture-gen-option">
                    <label>Style</label>
                    <select id="texture-style">
                      <option value="realistic">Realistic</option>
                      <option value="stylized">Stylized / Game Art</option>
                      <option value="painterly">Painterly</option>
                      <option value="pixel">Pixel Art</option>
                    </select>
                  </div>
                  <div class="texture-gen-option">
                    <label>Size</label>
                    <select id="texture-size">
                      <option value="512">512 × 512</option>
                      <option value="1024" selected>1024 × 1024</option>
                    </select>
                  </div>
                  <div class="texture-gen-option">
                    <label>Seamless</label>
                    <select id="texture-seamless">
                      <option value="yes" selected>Yes (Tileable)</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div class="texture-gen-section">
                <button class="texture-gen-btn" id="generate-btn" style="width: 100%;">
                  ✨ Generate Texture
                </button>
                
                <div id="loading-indicator" style="display: none;" class="texture-gen-loading">
                  <div class="texture-gen-spinner"></div>
                  <span>Generating texture... This may take 10-30 seconds</span>
                </div>
                
                <div id="error-display" class="texture-gen-error" style="display: none;"></div>
              </div>
              
              <div class="texture-gen-section" id="preview-section" style="display: none;">
                <h3>Preview</h3>
                <div class="texture-gen-preview">
                  <div class="texture-gen-preview-box" id="preview-box">
                    <span>No texture generated</span>
                  </div>
                  <div class="texture-gen-preview-actions">
                    <button class="texture-gen-btn" id="apply-btn" ${t?"":'disabled title="Select an object first"'}>
                      ${t?"✓ Apply to Selected Object":"⚠️ No Object Selected"}
                    </button>
                    <button class="texture-gen-btn secondary" id="download-btn">⬇️ Download</button>
                    <button class="texture-gen-btn secondary" id="regenerate-btn">🔄 Regenerate</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Skybox Tab -->
            <div class="texture-gen-tab-content" id="tab-skybox">
              <div class="texture-gen-section">
                <h3>🌅 Generate Skybox</h3>
                <p style="font-size: 12px; color: #888; margin-bottom: 15px;">
                  Generate a panoramic sky image to use as the scene background.
                </p>
                <textarea class="texture-gen-input" id="skybox-prompt" rows="2" 
                  placeholder="e.g., sunset over city skyline, night sky with stars, cloudy daytime sky..."></textarea>
                
                <div class="texture-gen-presets" style="margin-top: 10px;">
                  <span style="color: #666; font-size: 12px; margin-right: 5px;">Quick:</span>
                  <button class="texture-gen-preset skybox-preset" data-prompt="blue sky with fluffy white clouds, sunny day">Sunny Day</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="dramatic sunset with orange and purple clouds over city">Sunset</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="night sky with stars and moon, dark blue">Night</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="overcast gray cloudy sky, moody">Overcast</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="golden hour warm light, dramatic clouds">Golden Hour</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="pink and purple vaporwave sunset, aesthetic">Vaporwave</button>
                </div>
              </div>
              
              <div class="texture-gen-section">
                <button class="texture-gen-btn" id="generate-skybox-btn" style="width: 100%;">
                  ✨ Generate Skybox
                </button>
                
                <div id="skybox-loading" style="display: none;" class="texture-gen-loading">
                  <div class="texture-gen-spinner"></div>
                  <span>Generating skybox...</span>
                </div>
                
                <div id="skybox-error" class="texture-gen-error" style="display: none;"></div>
              </div>
              
              <div class="texture-gen-section" id="skybox-preview-section" style="display: none;">
                <h3>Preview</h3>
                <div class="texture-gen-preview">
                  <div class="texture-gen-preview-box" id="skybox-preview-box" style="width: 300px;">
                    <span>No skybox generated</span>
                  </div>
                  <div class="texture-gen-preview-actions">
                    <button class="texture-gen-btn" id="apply-skybox-btn">✓ Apply to Scene</button>
                    <button class="texture-gen-btn secondary" id="download-skybox-btn">⬇️ Download</button>
                  </div>
                </div>
              </div>
              
              <div class="texture-gen-section">
                <h3>Current Skybox</h3>
                <div style="display: flex; gap: 10px;">
                  <button class="texture-gen-btn secondary" id="remove-skybox-btn">🗑️ Remove Skybox</button>
                </div>
              </div>
            </div>

            <!-- History Tab -->
            <div class="texture-gen-tab-content" id="tab-history">
              <div class="texture-gen-section">
                <h3>Recent Textures</h3>
                <div class="texture-gen-history" id="history-grid">
                  <span style="color: #666;">No textures generated yet</span>
                </div>
                <div style="margin-top: 10px;">
                  <button class="texture-gen-btn secondary" id="clear-all-textures-btn" style="background: #5a3a3a;">🗑️ Clear All Textures</button>
                  <span style="font-size: 11px; color: #888; margin-left: 10px;">Free up storage space</span>
                </div>
              </div>
              <div class="texture-gen-section">
                <h3>Texture Packs</h3>
                <p style="font-size: 12px; color: #888; margin-bottom: 10px;">
                  Export all your textures as a pack to share or backup, or import packs from other projects.
                </p>
                <div style="display: flex; gap: 10px;">
                  <button class="texture-gen-btn secondary" id="export-pack-btn">📤 Export Pack</button>
                  <button class="texture-gen-btn secondary" id="import-pack-btn">📥 Import Pack</button>
                </div>
                <input type="file" id="pack-import-input" accept=".json" style="display: none;">
              </div>
            </div>

            <!-- Settings Tab -->
            <div class="texture-gen-tab-content" id="tab-settings">
              <div class="texture-gen-section">
                <h3>API Settings</h3>
                <button class="texture-gen-btn secondary" id="show-config-btn">Change API Configuration</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `}setupEventListeners(){if(!this.modal)return;this.modal.querySelector(".texture-gen-close")?.addEventListener("click",()=>this.hide()),this.modal.addEventListener("click",t=>{t.target===this.modal&&this.hide()}),this.modal.querySelectorAll(".texture-gen-tab").forEach(t=>{t.addEventListener("click",()=>{const i=t.getAttribute("data-tab");this.switchTab(i)})}),this.modal.querySelectorAll(".texture-gen-preset").forEach(t=>{t.addEventListener("click",()=>{const i=t.getAttribute("data-prompt"),s=this.modal.querySelector("#texture-prompt");s.value=i})}),this.modal.querySelector("#generate-btn")?.addEventListener("click",()=>this.generate()),this.modal.querySelector("#regenerate-btn")?.addEventListener("click",()=>this.generate()),this.modal.querySelector("#apply-btn")?.addEventListener("click",()=>this.applyTexture()),this.modal.querySelector("#download-btn")?.addEventListener("click",()=>this.downloadCurrentTexture()),this.modal.querySelector("#save-config-btn")?.addEventListener("click",()=>this.saveConfig()),this.modal.querySelector("#cancel-config-btn")?.addEventListener("click",()=>this.hideConfigSection()),this.modal.querySelector("#show-config-btn")?.addEventListener("click",()=>this.showConfigSection()),this.modal.querySelector("#export-pack-btn")?.addEventListener("click",()=>{se.exportTexturePack("my-textures")});const e=this.modal.querySelector("#pack-import-input");this.modal.querySelector("#import-pack-btn")?.addEventListener("click",()=>{e?.click()}),e?.addEventListener("change",async()=>{const t=e.files?.[0];if(t){try{const i=await se.importTexturePack(t);this.updateHistoryDisplay(),alert(`Imported ${i} new textures!`)}catch(i){alert("Failed to import: "+i.message)}e.value=""}}),this.modal.querySelector("#clear-all-textures-btn")?.addEventListener("click",()=>{confirm("Clear all textures from history? This will free up storage space.")&&(se.clearHistory(),this.updateHistoryDisplay())}),this.modal.querySelectorAll(".skybox-preset").forEach(t=>{t.addEventListener("click",()=>{const i=t.getAttribute("data-prompt"),s=this.modal.querySelector("#skybox-prompt");s.value=i})}),this.modal.querySelector("#generate-skybox-btn")?.addEventListener("click",()=>this.generateSkybox()),this.modal.querySelector("#apply-skybox-btn")?.addEventListener("click",()=>this.applySkybox()),this.modal.querySelector("#download-skybox-btn")?.addEventListener("click",()=>this.downloadCurrentSkybox()),this.modal.querySelector("#remove-skybox-btn")?.addEventListener("click",()=>{this.callbacks.onSkyboxRemoved?.(),this.hide()})}switchTab(e){this.modal&&(this.modal.querySelectorAll(".texture-gen-tab").forEach(t=>{t.classList.toggle("active",t.getAttribute("data-tab")===e)}),this.modal.querySelectorAll(".texture-gen-tab-content").forEach(t=>{t.classList.toggle("active",t.id===`tab-${e}`)}))}showConfigSection(){if(!this.modal)return;const e=this.modal.querySelector("#config-section"),t=this.modal.querySelector("#generator-section");e&&(e.style.display="block"),t&&(t.style.display="none")}hideConfigSection(){if(!this.modal)return;const e=this.modal.querySelector("#config-section"),t=this.modal.querySelector("#generator-section");e&&(e.style.display="none"),t&&(t.style.display="block")}saveConfig(){if(!this.modal)return;const e=this.modal.querySelector("#config-provider").value,t=this.modal.querySelector("#config-api-key").value;if(!t.trim()){this.showError("Please enter an API key");return}se.saveConfig({provider:e,apiKey:t}),this.hideConfigSection()}currentTexture=null;currentSkybox=null;async generate(){if(!this.modal||this.isGenerating)return;const e=this.modal.querySelector("#texture-prompt").value.trim();if(!e){this.showError("Please enter a texture description");return}const t=this.modal.querySelector("#texture-style").value,i=parseInt(this.modal.querySelector("#texture-size").value),s=this.modal.querySelector("#texture-seamless").value==="yes";this.isGenerating=!0,this.showLoading(!0),this.hideError();try{const n=await se.generate({prompt:e,width:i,height:i,seamless:s,style:t});this.currentTexture=n,this.showPreview(n),this.updateHistoryDisplay()}catch(n){this.showError(n.message||"Failed to generate texture")}finally{this.isGenerating=!1,this.showLoading(!1)}}showLoading(e){if(!this.modal)return;const t=this.modal.querySelector("#loading-indicator"),i=this.modal.querySelector("#generate-btn");t&&(t.style.display=e?"flex":"none"),i&&(i.disabled=e)}showError(e){if(!this.modal)return;const t=this.modal.querySelector("#error-display");t&&(t.textContent=e,t.style.display="block")}hideError(){if(!this.modal)return;const e=this.modal.querySelector("#error-display");e&&(e.style.display="none")}showPreview(e){if(!this.modal)return;const t=this.modal.querySelector("#preview-section"),i=this.modal.querySelector("#preview-box");t&&(t.style.display="block"),i&&(i.innerHTML=`<img src="${e.url}" alt="Generated texture">`)}async applyTexture(){if(this.currentTexture){if(this.groundMode){try{const e=await se.urlToDataUrl(this.currentTexture.url);this.callbacks.onGroundTextureApplied?.(e),this.hide()}catch(e){this.showError("Failed to apply ground texture: "+e.message)}return}if(this.selectedObject)try{const e=await se.urlToDataUrl(this.currentTexture.url);this.textureLoader.load(e,t=>{t.wrapS=me,t.wrapT=me,t.repeat.set(2,2),t.colorSpace=ue,this.selectedObject.mesh.traverse(i=>{if(i instanceof f){const s=i.material;s.map&&s.map.dispose(),s.map=t,s.color.setHex(16777215),s.needsUpdate=!0}}),this.selectedObject.data.params||(this.selectedObject.data.params={}),this.selectedObject.data.params.textureUrl=e,this.callbacks.onTextureApplied?.(this.selectedObject,e),this.hide()},void 0,t=>{console.error("Texture load error:",t),this.showError("Failed to load texture")})}catch(e){this.showError("Failed to apply texture: "+e.message)}}}async downloadCurrentTexture(){this.currentTexture&&await se.downloadTexture(this.currentTexture)}updateHistoryDisplay(){if(!this.modal)return;const e=this.modal.querySelector("#history-grid"),t=se.getHistory();if(t.length===0){e.innerHTML='<span style="color: #666;">No textures generated yet</span>';return}e.innerHTML=t.map((i,s)=>`
      <div class="texture-gen-history-item" data-index="${s}" title="${i.prompt}">
        <img src="${i.url}" alt="${i.prompt}">
        <button class="delete-btn" data-delete-index="${s}" title="Delete">×</button>
      </div>
    `).join(""),e.querySelectorAll(".texture-gen-history-item").forEach(i=>{i.addEventListener("click",s=>{if(s.target.classList.contains("delete-btn"))return;const n=parseInt(i.getAttribute("data-index")),o=t[n];this.currentTexture=o,this.showPreview(o),this.switchTab("generate")})}),e.querySelectorAll(".delete-btn").forEach(i=>{i.addEventListener("click",s=>{s.stopPropagation();const n=parseInt(i.getAttribute("data-delete-index"));se.deleteFromHistory(n),this.updateHistoryDisplay()})})}setSelectedObject(e){if(this.selectedObject=e,this.modal){const t=this.modal.querySelector("#apply-btn");t&&(t.disabled=!e,t.textContent=e?"✓ Apply to Selected Object":"⚠️ No Object Selected")}}async generateSkybox(){if(!this.modal||this.isGenerating)return;const e=this.modal.querySelector("#skybox-prompt").value.trim();if(!e){this.showSkyboxError("Please enter a skybox description");return}this.isGenerating=!0,this.showSkyboxLoading(!0),this.hideSkyboxError();try{const t=`${e}, panoramic sky background, equirectangular projection, 360 degree view, seamless horizon`,i=await se.generate({prompt:t,width:1024,height:512,seamless:!0,style:"realistic"});this.currentSkybox=i,this.showSkyboxPreview(i)}catch(t){this.showSkyboxError(t.message||"Failed to generate skybox")}finally{this.isGenerating=!1,this.showSkyboxLoading(!1)}}showSkyboxLoading(e){if(!this.modal)return;const t=this.modal.querySelector("#skybox-loading"),i=this.modal.querySelector("#generate-skybox-btn");t&&(t.style.display=e?"flex":"none"),i&&(i.disabled=e)}showSkyboxError(e){if(!this.modal)return;const t=this.modal.querySelector("#skybox-error");t&&(t.textContent=e,t.style.display="block")}hideSkyboxError(){if(!this.modal)return;const e=this.modal.querySelector("#skybox-error");e&&(e.style.display="none")}showSkyboxPreview(e){if(!this.modal)return;const t=this.modal.querySelector("#skybox-preview-section"),i=this.modal.querySelector("#skybox-preview-box");t&&(t.style.display="block"),i&&(i.innerHTML=`<img src="${e.url}" alt="Generated skybox" style="object-fit: contain;">`)}async applySkybox(){if(this.currentSkybox)try{const e=await se.urlToDataUrl(this.currentSkybox.url);this.callbacks.onSkyboxApplied?.(e),this.hide()}catch(e){this.showSkyboxError("Failed to apply skybox: "+e.message)}}async downloadCurrentSkybox(){this.currentSkybox&&await se.downloadTexture(this.currentSkybox,"skybox.png")}}const Ai=500;class sr{editor;callbacks;uiRoot;palettePanel;toolbar;statusBar;textureGeneratorUI;textureLoader;selectedCategory=0;constructor(e,t={},i={}){this.callbacks=t,this.uiRoot=document.createElement("div"),this.uiRoot.id="editor-ui",this.uiRoot.style.cssText="position: relative; z-index: 10; width: 100%; height: 100%;",this.uiRoot.innerHTML=this.getLayoutHTML(),e.appendChild(this.uiRoot),this.injectStyles(),this.palettePanel=this.uiRoot.querySelector("#palette-panel"),this.toolbar=this.uiRoot.querySelector("#editor-toolbar"),this.statusBar=this.uiRoot.querySelector("#status-bar");const s=this.uiRoot.querySelector("#editor-viewport");if(this.editor=new er(s,{onObjectSelected:n=>this.onObjectSelected(n),onObjectsChanged:()=>this.onObjectsChanged(),onLevelChanged:()=>this.onLevelChanged(),canAddObject:()=>this.canAddObject()}),this.textureLoader=new vt,this.textureGeneratorUI=new ir(this.uiRoot,{onTextureApplied:(n,o)=>{this.updatePropertiesPanel(n),this.showToast("Texture Applied!")},onSkyboxApplied:n=>{this.editor.setSkyboxTexture(n),this.showToast("Skybox Applied!")},onSkyboxRemoved:()=>{this.editor.removeSkybox(),this.showToast("Skybox Removed")},onGroundTextureApplied:n=>{this.editor.setGroundTexture(n),this.showToast("Ground Texture Applied!")}}),this.setupToolbar(),this.setupPalette(),this.updatePropertiesPanel(null),this.updateLevelSettings(),!i.skipAutosaveCheck){const n=Ae.loadAutosave();n&&confirm("Found an autosaved level. Would you like to restore it?")&&this.editor.loadLevel(n)}}getLayoutHTML(){return`
      <div id="editor-layout">
        <!-- Toolbar -->
        <div id="editor-toolbar">
          <div class="toolbar-group">
            <button id="btn-new" title="New Level (Ctrl+N)">📄 New</button>
            <button id="btn-save" title="Save (Ctrl+S)">💾 Save</button>
            <button id="btn-load" title="Load">📂 Load</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="toolbar-group">
            <button id="btn-export" title="Export to File">📤 Export</button>
            <button id="btn-import" title="Import from File">📥 Import</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="toolbar-group">
            <button id="btn-texture-gen" title="AI Texture Generator">🎨 AI Textures</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="toolbar-group">
            <button id="btn-play" title="Test Level">▶️ Play Test</button>
          </div>
          <div class="toolbar-spacer"></div>
          <div class="toolbar-group">
            <button id="btn-exit" title="Exit Editor">❌ Exit</button>
          </div>
        </div>
        
        <!-- Main content area -->
        <div id="editor-content">
          <!-- Left: Object Palette -->
          <div id="palette-panel">
            <div class="panel-header">Objects</div>
            <div id="category-tabs"></div>
            <div id="object-list"></div>
          </div>
          
          <!-- Center: 3D Viewport -->
          <div id="editor-viewport"></div>
          
          <!-- Right: Properties -->
          <div id="properties-panel">
            <div class="panel-header">Properties</div>
            <div id="object-properties"></div>
            <div class="panel-header" style="margin-top: 20px;">Level Settings</div>
            <div id="level-settings"></div>
          </div>
        </div>
        
        <!-- Status bar -->
        <div id="status-bar">
          <span id="status-text">Ready</span>
          <span id="status-position"></span>
          <span id="status-grid">Grid: 1</span>
          <span id="object-count-container" style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
            <span id="object-count-label">Objects: 0/500</span>
            <div id="object-count-bar" style="width: 100px; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
              <div id="object-count-fill" style="width: 0%; height: 100%; background: #00ff88; transition: width 0.2s, background 0.2s;"></div>
            </div>
          </span>
        </div>
      </div>
      
      <!-- File input (hidden) -->
      <input type="file" id="import-input" accept=".json" style="display: none;">
      
      <!-- Toast notification -->
      <div id="editor-toast" class="editor-toast">
        <span class="toast-icon">✓</span>
        <span class="toast-message">Level Saved!</span>
      </div>
      
      <!-- Object limit dialog (hidden) -->
      <div id="limit-dialog" class="dialog-overlay" style="display: none;">
        <div class="dialog-content" style="max-width: 400px;">
          <div class="dialog-header">
            <h3>⚠️ Object Limit Reached</h3>
            <button class="dialog-close">✕</button>
          </div>
          <p style="padding: 20px; color: #ccc; line-height: 1.5;">
            You've reached the maximum number of objects (500) allowed in a level. 
            This limit ensures good performance during gameplay.
          </p>
          <p style="padding: 0 20px 20px; color: #888;">
            Delete some objects to free up space for new ones.
          </p>
          <div class="dialog-footer">
            <button id="btn-close-limit">OK</button>
          </div>
        </div>
      </div>
      
      <!-- Load dialog (hidden) -->
      <div id="load-dialog" class="dialog-overlay" style="display: none;">
        <div class="dialog-content">
          <div class="dialog-header">
            <h3>Load Level</h3>
            <button class="dialog-close">✕</button>
          </div>
          <div id="saved-levels-list"></div>
          <div class="dialog-footer">
            <button id="btn-cancel-load">Cancel</button>
          </div>
        </div>
      </div>
    `}injectStyles(){const e=document.createElement("style");e.textContent=`
      #editor-ui {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        font-family: 'Kanit', sans-serif;
        color: #fff;
        background: #1a1a2e;
      }
      
      #editor-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      
      /* Toolbar */
      #editor-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #2a2a4e;
        border-bottom: 1px solid #3a3a6e;
      }
      
      #editor-toolbar button {
        padding: 8px 12px;
        font-size: 13px;
        font-family: inherit;
        color: #fff;
        background: #3a3a5e;
        border: 1px solid #4a4a7e;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      #editor-toolbar button:hover {
        background: #4a4a7e;
        border-color: #6a6a9e;
      }
      
      .toolbar-group {
        display: flex;
        gap: 4px;
      }
      
      .toolbar-divider {
        width: 1px;
        height: 24px;
        background: #4a4a7e;
        margin: 0 8px;
      }
      
      .toolbar-spacer {
        flex: 1;
      }
      
      /* Main content */
      #editor-content {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
      
      /* Panels */
      #palette-panel, #properties-panel {
        width: 260px;
        background: #22223a;
        border: 1px solid #3a3a6e;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .panel-header {
        padding: 12px 15px;
        font-weight: 600;
        font-size: 14px;
        color: #aaa;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-bottom: 1px solid #3a3a6e;
      }
      
      /* Category tabs */
      #category-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px;
        border-bottom: 1px solid #3a3a6e;
      }
      
      .category-tab {
        padding: 6px 10px;
        font-size: 18px;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .category-tab:hover {
        background: #3a3a5e;
      }
      
      .category-tab.active {
        background: #4a7a4a;
        border-color: #5a9a5a;
      }
      
      /* Object list */
      #object-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      
      .object-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 6px;
        margin-bottom: 6px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .object-item:hover {
        background: #3a3a5e;
        border-color: #5a5a8e;
      }
      
      .object-item.selected {
        background: #4a7a4a;
        border-color: #5a9a5a;
      }
      
      .object-icon {
        font-size: 24px;
        width: 32px;
        text-align: center;
      }
      
      .object-info {
        flex: 1;
      }
      
      .object-name {
        font-weight: 600;
        font-size: 13px;
      }
      
      .object-desc {
        font-size: 11px;
        color: #888;
        margin-top: 2px;
      }
      
      /* Properties */
      #object-properties, #level-settings {
        padding: 12px;
        overflow-y: auto;
      }
      
      .prop-group {
        margin-bottom: 15px;
      }
      
      .prop-label {
        font-size: 11px;
        color: #888;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      
      .prop-input {
        width: 100%;
        padding: 8px 10px;
        font-size: 13px;
        font-family: inherit;
        color: #fff;
        background: #1a1a2e;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
        box-sizing: border-box;
      }
      
      .prop-input:focus {
        outline: none;
        border-color: #5a9a5a;
      }
      
      .prop-row {
        display: flex;
        gap: 8px;
      }
      
      .prop-row .prop-group {
        flex: 1;
      }
      
      .prop-color {
        width: 100%;
        height: 36px;
        padding: 2px;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .prop-btn {
        padding: 6px 12px;
        background: #3a3a6e;
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 16px;
      }
      
      .prop-btn:hover {
        background: #4a4a8e;
      }
      
      /* Viewport */
      #editor-viewport {
        flex: 1;
        position: relative;
        background: #111;
      }
      
      #editor-viewport canvas {
        width: 100% !important;
        height: 100% !important;
      }
      
      /* Status bar */
      #status-bar {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 6px 12px;
        font-size: 12px;
        color: #888;
        background: #2a2a4e;
        border-top: 1px solid #3a3a6e;
      }
      
      #status-bar span {
        padding: 2px 8px;
        background: #1a1a2e;
        border-radius: 3px;
      }
      
      /* Dialog */
      .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      
      .dialog-content {
        width: 500px;
        max-height: 80vh;
        background: #22223a;
        border: 1px solid #4a4a7e;
        border-radius: 8px;
        overflow: hidden;
      }
      
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 20px;
        background: #2a2a4e;
        border-bottom: 1px solid #3a3a6e;
      }
      
      .dialog-header h3 {
        margin: 0;
        font-size: 16px;
      }
      
      .dialog-close {
        padding: 4px 8px;
        font-size: 16px;
        background: transparent;
        border: none;
        color: #888;
        cursor: pointer;
      }
      
      .dialog-close:hover {
        color: #fff;
      }
      
      #saved-levels-list {
        padding: 15px;
        max-height: 400px;
        overflow-y: auto;
      }
      
      .saved-level-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 15px;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 6px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .saved-level-item:hover {
        background: #3a3a5e;
        border-color: #5a5a8e;
      }
      
      .saved-level-info {
        flex: 1;
      }
      
      .saved-level-name {
        font-weight: 600;
      }
      
      .saved-level-meta {
        font-size: 11px;
        color: #888;
        margin-top: 4px;
      }
      
      .saved-level-actions {
        display: flex;
        gap: 8px;
      }
      
      .saved-level-actions button {
        padding: 6px 12px;
        font-size: 12px;
        background: #3a3a5e;
        border: 1px solid #4a4a7e;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
      }
      
      .saved-level-actions button:hover {
        background: #4a4a7e;
      }
      
      .saved-level-actions button.delete {
        background: #5a3a3a;
        border-color: #7a4a4a;
      }
      
      .saved-level-actions button.delete:hover {
        background: #7a4a4a;
      }
      
      .dialog-footer {
        padding: 15px 20px;
        border-top: 1px solid #3a3a6e;
        text-align: right;
      }
      
      .dialog-footer button {
        padding: 8px 20px;
        font-size: 13px;
        font-family: inherit;
        background: #3a3a5e;
        border: 1px solid #4a4a7e;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
      }
      
      .no-levels {
        text-align: center;
        color: #666;
        padding: 30px;
      }
      
      /* Toast notifications */
      .editor-toast {
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        padding: 12px 24px;
        background: linear-gradient(135deg, #2d5a2d, #1a3a1a);
        border: 2px solid #4a9a4a;
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        z-index: 3000;
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: none;
      }
      
      .editor-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      
      .editor-toast.error {
        background: linear-gradient(135deg, #5a2d2d, #3a1a1a);
        border-color: #9a4a4a;
      }
      
      .editor-toast .toast-icon {
        margin-right: 8px;
      }
      
      /* Keyboard hints */
      .keyboard-hints {
        padding: 12px;
        font-size: 11px;
        color: #666;
        border-top: 1px solid #3a3a6e;
      }
      
      .keyboard-hints div {
        margin-bottom: 4px;
      }
      
      .keyboard-hints kbd {
        display: inline-block;
        padding: 2px 5px;
        font-family: 'Kanit', sans-serif;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 3px;
        font-size: 10px;
      }
    `,document.head.appendChild(e)}setupToolbar(){this.toolbar.querySelector("#btn-new")?.addEventListener("click",()=>{confirm("Create a new level? Unsaved changes will be lost.")&&(this.editor.newLevel(),this.updateLevelSettings(),this.setStatus("New level created"))}),this.toolbar.querySelector("#btn-save")?.addEventListener("click",()=>{this.editor.save()?(this.showToast("Level Saved!"),this.setStatus("Level saved")):(this.showToast("Failed to save level",!0),this.setStatus("Save failed"))}),this.toolbar.querySelector("#btn-load")?.addEventListener("click",()=>{this.showLoadDialog()}),this.toolbar.querySelector("#btn-export")?.addEventListener("click",()=>{this.editor.exportLevel(),this.showToast("Level Exported!"),this.setStatus("Level exported")});const e=this.uiRoot.querySelector("#import-input");this.toolbar.querySelector("#btn-import")?.addEventListener("click",()=>{e.click()}),e.addEventListener("change",async()=>{const s=e.files?.[0];s&&(await this.editor.importLevel(s)?(this.updateLevelSettings(),this.showToast("Level Imported!"),this.setStatus("Level imported")):(this.showToast("Failed to import level",!0),this.setStatus("Import failed")),e.value="")}),this.toolbar.querySelector("#btn-texture-gen")?.addEventListener("click",()=>{const s=this.editor.getSelectedObject();this.textureGeneratorUI.show(s)}),this.toolbar.querySelector("#btn-play")?.addEventListener("click",()=>{this.callbacks.onPlayTest?.(this.editor.getLevel())}),this.toolbar.querySelector("#btn-exit")?.addEventListener("click",()=>{confirm("Exit editor? Make sure you have saved your level.")&&this.callbacks.onExit?.()});const t=this.uiRoot.querySelector("#load-dialog");t.querySelector(".dialog-close")?.addEventListener("click",()=>{t.style.display="none"}),t.querySelector("#btn-cancel-load")?.addEventListener("click",()=>{t.style.display="none"});const i=this.uiRoot.querySelector("#limit-dialog");i?.querySelector(".dialog-close")?.addEventListener("click",()=>{i.style.display="none"}),i?.querySelector("#btn-close-limit")?.addEventListener("click",()=>{i.style.display="none"})}setupPalette(){const e=this.uiRoot.querySelector("#category-tabs");e.innerHTML=Ms.map((i,s)=>`
      <div class="category-tab ${s===0?"active":""}" data-index="${s}" title="${i.name}">
        ${i.icon}
      </div>
    `).join(""),e.querySelectorAll(".category-tab").forEach(i=>{i.addEventListener("click",()=>{const s=parseInt(i.getAttribute("data-index"));this.selectCategory(s)})}),this.renderObjectList();const t=document.createElement("div");t.className="keyboard-hints",t.innerHTML=`
      <div><kbd>T</kbd> Translate mode</div>
      <div><kbd>R</kbd> Rotate mode</div>
      <div><kbd>[ ]</kbd> Rotate 15°</div>
      <div><kbd>Del</kbd> Delete object</div>
      <div><kbd>G</kbd> Toggle grid snap</div>
      <div><kbd>Esc</kbd> Cancel/Deselect</div>
      <div><kbd>Ctrl+D</kbd> Duplicate</div>
    `,this.palettePanel.appendChild(t)}selectCategory(e){this.selectedCategory=e,this.uiRoot.querySelectorAll(".category-tab").forEach((t,i)=>{t.classList.toggle("active",i===e)}),this.renderObjectList()}renderObjectList(){const e=this.uiRoot.querySelector("#object-list"),t=Ms[this.selectedCategory];e.innerHTML=t.items.map(i=>`
      <div class="object-item" data-type="${i.type}">
        <div class="object-icon">${i.icon}</div>
        <div class="object-info">
          <div class="object-name">${i.name}</div>
          <div class="object-desc">${i.description}</div>
        </div>
      </div>
    `).join(""),e.querySelectorAll(".object-item").forEach(i=>{i.addEventListener("click",()=>{const s=i.getAttribute("data-type"),n=t.items.find(o=>o.type===s);if(n){const o=i.classList.contains("selected");e.querySelectorAll(".object-item").forEach(a=>a.classList.remove("selected")),o?this.editor.cancelPlacement():(i.classList.add("selected"),this.editor.startPlacement(n),this.setStatus(`Click to place ${n.name}`))}})})}onObjectSelected(e){this.uiRoot.querySelectorAll(".object-item").forEach(t=>t.classList.remove("selected")),this.updatePropertiesPanel(e),this.textureGeneratorUI.setSelectedObject(e)}onObjectsChanged(){const e=this.editor.getLevel();this.setStatus(`${e.objects.length} objects`),this.updateObjectCount()}updateObjectCount(){const t=this.editor.getLevel().objects.length,i=t/Ai*100,s=this.statusBar.querySelector("#object-count-label"),n=this.statusBar.querySelector("#object-count-fill");s&&(s.textContent=`Objects: ${t}/${Ai}`),n&&(n.style.width=`${Math.min(i,100)}%`,i>=90?n.style.background="#ff4444":i>=75?n.style.background="#ffaa00":n.style.background="#00ff88")}canAddObject(){return this.editor.getLevel().objects.length>=Ai?(this.showLimitDialog(),!1):!0}showLimitDialog(){const e=this.uiRoot.querySelector("#limit-dialog");e&&(e.style.display="flex")}onLevelChanged(){this.updateLevelSettings()}updatePropertiesPanel(e){const t=this.uiRoot.querySelector("#object-properties");if(!e){t.innerHTML=`
        <div style="color: #666; text-align: center; padding: 20px;">
          Select an object to edit its properties
        </div>
      `;return}const i=e.data.position,s=e.data.rotation||[0,0,0];t.innerHTML=`
      <div class="prop-group">
        <div class="prop-label">Type</div>
        <div style="color: #fff; font-weight: 600;">${e.data.type}</div>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Position</div>
        <div class="prop-row">
          <div class="prop-group">
            <input type="number" class="prop-input" id="prop-pos-x" value="${i[0].toFixed(1)}" step="0.5">
          </div>
          <div class="prop-group">
            <input type="number" class="prop-input" id="prop-pos-y" value="${i[1].toFixed(1)}" step="0.5">
          </div>
          <div class="prop-group">
            <input type="number" class="prop-input" id="prop-pos-z" value="${i[2].toFixed(1)}" step="0.5">
          </div>
        </div>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Rotation (Y)</div>
        <input type="number" class="prop-input" id="prop-rot-y" value="${s[1].toFixed(0)}" step="15">
      </div>
      
      ${this.renderTextureSelector(e)}
      
      ${this.renderMaterialPartsEditor(e)}
      
      ${this.renderParamsInputs(e)}
      
      <div class="prop-group" style="margin-top: 20px;">
        <button id="btn-delete-object" style="
          width: 100%;
          padding: 10px;
          background: #5a3a3a;
          border: 1px solid #7a4a4a;
          border-radius: 4px;
          color: #fff;
          cursor: pointer;
          font-family: inherit;
        ">🗑️ Delete Object</button>
      </div>
    `;const n=t.querySelector("#prop-pos-x"),o=t.querySelector("#prop-pos-y"),a=t.querySelector("#prop-pos-z"),r=t.querySelector("#prop-rot-y"),l=()=>{e.data.position=[parseFloat(n.value),parseFloat(o.value),parseFloat(a.value)],e.mesh.position.set(e.data.position[0],e.data.position[1],e.data.position[2])},d=()=>{e.data.rotation=[0,parseFloat(r.value),0],e.mesh.rotation.y=e.data.rotation[1]*Math.PI/180};n.addEventListener("change",l),o.addEventListener("change",l),a.addEventListener("change",l),r.addEventListener("change",d),t.querySelector("#btn-delete-object")?.addEventListener("click",()=>{this.editor.deleteSelectedObject()});const c=t.querySelector("#prop-texture");c?.addEventListener("change",()=>{const h=parseInt(c.value),u=se.getHistory(),y=h>=0&&h<u.length?u[h].url:"";this.applyTextureToObjectType(e,y)}),t.querySelector("#clear-texture-history")?.addEventListener("click",()=>{confirm("Clear all generated textures from history?")&&(se.clearHistory(),this.updatePropertiesPanel(e))}),this.setupPartMaterialListeners(e,t)}renderTextureSelector(e){const t=se.getHistory(),i=e.data.params?.textureUrl||"";let s=-1;t.forEach((o,a)=>{o.url===i&&(s=a)});let n=`
      <div class="prop-group">
        <div class="prop-label">Texture</div>
        <select class="prop-input" id="prop-texture" data-texture-count="${t.length}">
          <option value="-1" ${s===-1?"selected":""}>Default (None)</option>
    `;return t.forEach((o,a)=>{const r=a===s?"selected":"",l=o.prompt.length>25?o.prompt.substring(0,25)+"...":o.prompt;n+=`<option value="${a}" ${r}>${a+1}. ${l}</option>`}),n+=`
        </select>
        <div style="font-size: 10px; color: #666; margin-top: 4px;">
          Applies to all ${e.data.type} objects
        </div>
        ${t.length>0?'<button id="clear-texture-history" style="margin-top: 6px; padding: 4px 8px; font-size: 10px; cursor: pointer;">Clear History</button>':""}
      </div>
    `,n}getObjectParts(e){const t=new Map;return e.traverse(i=>{if(i instanceof f&&i.name){const s=t.get(i.name)||[];s.push(i),t.set(i.name,s)}}),e.traverse(i=>{if(i instanceof f&&!i.name){const s=t.get("Main")||[];s.push(i),t.set("Main",s)}}),Array.from(t.entries()).map(([i,s])=>({name:i,meshes:s}))}renderMaterialPartsEditor(e){const t=this.getObjectParts(e.mesh);if(t.length<=1)return"";const i=se.getHistory(),s=e.data.params?.partMaterials||{};let n=`
      <div class="prop-group" style="border-top: 1px solid #3a3a6e; padding-top: 15px; margin-top: 15px;">
        <div class="prop-label" style="font-size: 13px; color: #888;">🎨 Per-Part Materials</div>
        <div style="font-size: 10px; color: #666; margin-bottom: 10px;">
          Edit colors and textures for each part of this object.
        </div>
    `;return t.forEach(o=>{const a=s[o.name]||{},l=o.meshes[0].material,d=a.color||"#"+l.color.getHexString(),c=a.textureIndex??-1,h=a.textureOpacity??1;n+=`
        <div class="part-material-row" style="background: #22223a; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
          <div style="font-weight: 600; color: #fff; margin-bottom: 8px;">${o.name}</div>
          
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
            <label style="font-size: 11px; color: #888; width: 50px;">Color</label>
            <input type="color" class="part-color" data-part="${o.name}" value="${d}" 
              style="width: 40px; height: 24px; border: none; cursor: pointer;">
          </div>
          
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
            <label style="font-size: 11px; color: #888; width: 50px;">Texture</label>
            <select class="part-texture" data-part="${o.name}" style="flex: 1; padding: 4px; font-size: 11px; background: #1a1a2e; border: 1px solid #3a3a6e; color: #fff; border-radius: 3px;">
              <option value="-1" ${c===-1?"selected":""}>None</option>
              ${i.map((u,y)=>`
                <option value="${y}" ${y===c?"selected":""}>
                  ${u.prompt.length>20?u.prompt.substring(0,20)+"...":u.prompt}
                </option>
              `).join("")}
            </select>
          </div>
          
          <div style="display: flex; gap: 8px; align-items: center;">
            <label style="font-size: 11px; color: #888; width: 50px;">Opacity</label>
            <input type="range" class="part-opacity" data-part="${o.name}" min="0" max="1" step="0.1" value="${h}"
              style="flex: 1;">
            <span class="part-opacity-value" style="font-size: 10px; color: #888; width: 30px;">${Math.round(h*100)}%</span>
          </div>
        </div>
      `}),n+="</div>",n}setupPartMaterialListeners(e,t){const i=this.getObjectParts(e.mesh),s=se.getHistory();e.data.params||(e.data.params={}),e.data.params.partMaterials||(e.data.params.partMaterials={});const n=e.data.params.partMaterials;t.querySelectorAll(".part-color").forEach(o=>{const a=o,r=a.dataset.part;a.addEventListener("input",()=>{const l=i.find(d=>d.name===r);l&&(n[r]||(n[r]={}),n[r].color=a.value,l.meshes.forEach(d=>{const c=d.material;c.color.setStyle(a.value),c.needsUpdate=!0}))})}),t.querySelectorAll(".part-texture").forEach(o=>{const a=o,r=a.dataset.part;a.addEventListener("change",()=>{const l=i.find(h=>h.name===r);if(!l)return;const d=parseInt(a.value);n[r]||(n[r]={}),n[r].textureIndex=d;const c=d>=0&&d<s.length?s[d].url:"";l.meshes.forEach(h=>{this.applyTextureToSingleMesh(h,c,n[r].textureOpacity??1)})})}),t.querySelectorAll(".part-opacity").forEach(o=>{const a=o,r=a.dataset.part,l=t.querySelector(`.part-opacity-value[data-part="${r}"]`)||a.nextElementSibling;a.addEventListener("input",()=>{const d=i.find(h=>h.name===r);if(!d)return;const c=parseFloat(a.value);n[r]||(n[r]={}),n[r].textureOpacity=c,l&&(l.textContent=Math.round(c*100)+"%"),d.meshes.forEach(h=>{const u=h.material;if(u.map){const y=n[r].color||"#"+u.color.getHexString(),b=this.blendColorWithWhite(y,c);u.color.setStyle(b),u.needsUpdate=!0}})})})}blendColorWithWhite(e,t){const i=parseInt(e.slice(1,3),16),s=parseInt(e.slice(3,5),16),n=parseInt(e.slice(5,7),16),o=Math.round(i+(255-i)*t),a=Math.round(s+(255-s)*t),r=Math.round(n+(255-n)*t);return`#${o.toString(16).padStart(2,"0")}${a.toString(16).padStart(2,"0")}${r.toString(16).padStart(2,"0")}`}applyTextureToSingleMesh(e,t,i=1){const s=e.material;if(!t){s.map&&(s.map.dispose(),s.map=null),s.needsUpdate=!0;return}this.textureLoader.load(t,n=>{n.wrapS=me,n.wrapT=me,n.repeat.set(2,2),n.colorSpace=ue,s.map&&s.map.dispose(),s.map=n,s.color.setStyle(this.blendColorWithWhite("#888888",i)),s.needsUpdate=!0})}applyTextureToObjectType(e,t){const i=e.data.type;this.editor.getLevel().objects.forEach(o=>{o.type===i&&(o.params||(o.params={}),o.params.textureUrl=t||void 0)}),this.editor.objects.forEach(o=>{o.data.type===i&&this.applyTextureToMesh(o.mesh,t)}),this.showToast(`Texture applied to all ${i} objects!`)}applyTextureToMesh(e,t){if(!t){e.traverse(i=>{if(i instanceof f){const s=i.material;s.map&&(s.map.dispose(),s.map=null),s.color.setHex(8947848),s.needsUpdate=!0}});return}console.log("Loading texture, URL type:",t.substring(0,50)+"..."),console.log("URL length:",t.length),console.log("Starts with data:",t.startsWith("data:")),this.textureLoader.load(t,i=>{console.log("Texture loaded successfully!"),i.wrapS=me,i.wrapT=me,i.repeat.set(2,2),i.colorSpace=ue,e.traverse(s=>{if(s instanceof f){const n=s.material;n.map&&n.map.dispose(),n.map=i.clone(),n.color.setHex(16777215),n.needsUpdate=!0}})},void 0,i=>{console.error("Failed to load texture:",i),console.error("URL was:",t.substring(0,100)+"...")})}renderParamsInputs(e){if(!e.data.params)return"";const t=e.data.params;let i='<div class="prop-group"><div class="prop-label">Parameters</div>';for(const[s,n]of Object.entries(t))i+=`
        <div style="margin-top: 8px;">
          <div style="font-size: 11px; color: #666; margin-bottom: 4px;">${s}</div>
          <input type="number" class="prop-input param-input" data-key="${s}" value="${n}" step="0.5">
        </div>
      `;return i+="</div>",i}updateLevelSettings(){const e=this.uiRoot.querySelector("#level-settings"),t=this.editor.getLevel();e.innerHTML=`
      <div class="prop-group">
        <div class="prop-label">Level Name</div>
        <input type="text" class="prop-input" id="level-name" value="${t.name}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Description</div>
        <input type="text" class="prop-input" id="level-desc" value="${t.description}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Size</div>
        <input type="number" class="prop-input" id="level-ground-size" value="${t.groundSize}" step="10" min="20" max="500">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Sky Preset</div>
        <select class="prop-input" id="sky-preset">
          <option value="">Custom</option>
          ${Object.entries(Si).map(([y,b])=>`<option value="${y}">${b.icon} ${b.name}</option>`).join("")}
        </select>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Sky Top</div>
        <input type="color" class="prop-color" id="level-sky-top" value="${t.skyColorTop||"#1e90ff"}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Sky Bottom</div>
        <input type="color" class="prop-color" id="level-sky-bottom" value="${t.skyColorBottom||"#87ceeb"}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Preset</div>
        <select class="prop-input" id="ground-preset">
          <option value="">Custom</option>
          <option value="#555555">⬛ Asphalt</option>
          <option value="#3d5c3d">🌿 Grass</option>
          <option value="#c2b280">🏖️ Sand</option>
          <option value="#4a4a5e">🏢 Office Floor</option>
          <option value="#2d2d2d">🌑 Dark Concrete</option>
          <option value="#8B4513">🪵 Wood</option>
          <option value="#87ceeb">💧 Water</option>
        </select>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Color</div>
        <input type="color" class="prop-color" id="level-ground-color" value="${t.groundColor}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Texture</div>
        <div style="display: flex; gap: 5px;">
          <button id="set-ground-texture-btn" class="prop-btn" style="flex: 1;">
            ${t.groundTextureUrl?"🎨 Change Texture":"🎨 Add Texture"}
          </button>
          ${t.groundTextureUrl?'<button id="remove-ground-texture-btn" class="prop-btn" title="Remove texture">✕</button>':""}
        </div>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Spawn Point</div>
        <div class="prop-row" style="align-items: center;">
          <div class="prop-group" style="flex: 1;">
            <input type="number" class="prop-input" id="spawn-x" value="${t.spawnPoint.position[0]}" step="1" placeholder="X">
          </div>
          <div class="prop-group" style="flex: 1;">
            <input type="number" class="prop-input" id="spawn-z" value="${t.spawnPoint.position[2]}" step="1" placeholder="Z">
          </div>
          <div class="prop-group" style="flex: 1;">
            <input type="number" class="prop-input" id="spawn-rot" value="${t.spawnPoint.rotation}" step="15" title="Rotation" placeholder="Rot">
          </div>
          <button id="place-spawn-btn" class="prop-btn" title="Click to place spawn point">📍</button>
        </div>
      </div>
    `;const i=(y,b)=>{const w=e.querySelector(`#${y}`);w?.addEventListener("change",()=>{let x=w.value;w.type==="number"&&(x=parseFloat(x)),this.editor.setLevelProperty(b,x)})};i("level-name","name"),i("level-desc","description"),i("level-ground-size","groundSize"),i("level-sky-color","skyColor"),i("level-ground-color","groundColor");const s=e.querySelector("#spawn-x"),n=e.querySelector("#spawn-z"),o=e.querySelector("#spawn-rot"),a=()=>{this.editor.setSpawnPoint(parseFloat(s.value),parseFloat(n.value),parseFloat(o.value))};s?.addEventListener("change",a),n?.addEventListener("change",a),o?.addEventListener("change",a),e.querySelector("#place-spawn-btn")?.addEventListener("click",()=>{this.editor.startSpawnPlacement((y,b)=>{s.value=y.toFixed(0),n.value=b.toFixed(0),a()}),this.setStatus("Click to place spawn point...")});const l=e.querySelector("#level-sky-top"),d=e.querySelector("#level-sky-bottom");l?.addEventListener("change",()=>{this.editor.setLevelProperty("skyColorTop",l.value)}),d?.addEventListener("change",()=>{this.editor.setLevelProperty("skyColorBottom",d.value)});const c=e.querySelector("#sky-preset");c?.addEventListener("change",()=>{if(c.value&&Si[c.value]){const y=Si[c.value];l.value=y.top,d.value=y.bottom,this.editor.setLevelProperty("skyColorTop",y.top),this.editor.setLevelProperty("skyColorBottom",y.bottom)}});const h=e.querySelector("#ground-preset"),u=e.querySelector("#level-ground-color");h?.addEventListener("change",()=>{h.value&&(u.value=h.value,this.editor.setLevelProperty("groundColor",h.value))}),e.querySelector("#set-ground-texture-btn")?.addEventListener("click",()=>{this.textureGeneratorUI.show(null),this.textureGeneratorUI.setGroundMode(!0)}),e.querySelector("#remove-ground-texture-btn")?.addEventListener("click",()=>{this.editor.removeGroundTexture(),this.updateLevelSettings()})}showLoadDialog(){const e=this.uiRoot.querySelector("#load-dialog"),t=e.querySelector("#saved-levels-list"),i=Ae.getSavedLevels();i.length===0?t.innerHTML='<div class="no-levels">No saved levels found</div>':(t.innerHTML=i.map(s=>`
        <div class="saved-level-item" data-id="${s.id}">
          <div class="saved-level-info">
            <div class="saved-level-name">${s.name}</div>
            <div class="saved-level-meta">
              ${s.objects.length} objects · Updated ${this.formatDate(s.updatedAt)}
            </div>
          </div>
          <div class="saved-level-actions">
            <button class="load-btn">Load</button>
            <button class="delete delete-btn">Delete</button>
          </div>
        </div>
      `).join(""),t.querySelectorAll(".load-btn").forEach(s=>{s.addEventListener("click",n=>{n.stopPropagation();const o=s.closest(".saved-level-item").dataset.id,a=i.find(r=>r.id===o);a&&(this.editor.loadLevel(a),this.updateLevelSettings(),e.style.display="none",this.setStatus(`Loaded: ${a.name}`))})}),t.querySelectorAll(".delete-btn").forEach(s=>{s.addEventListener("click",n=>{n.stopPropagation();const o=s.closest(".saved-level-item").dataset.id,a=i.find(r=>r.id===o);a&&confirm(`Delete "${a.name}"?`)&&(Ae.deleteLevel(o),this.showLoadDialog())})})),e.style.display="flex"}formatDate(e){const t=new Date(e);return t.toLocaleDateString()+" "+t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}setStatus(e){const t=this.statusBar.querySelector("#status-text");t&&(t.textContent=e)}showToast(e,t=!1){const i=this.uiRoot.querySelector("#editor-toast");if(!i)return;const s=i.querySelector(".toast-icon"),n=i.querySelector(".toast-message");s&&(s.textContent=t?"✗":"✓"),n&&(n.textContent=e),i.classList.toggle("error",t),i.classList.add("show"),setTimeout(()=>{i.classList.remove("show")},2e3)}loadLevel(e){this.editor.loadLevel(e),this.updatePropertiesPanel(null),this.updateObjectCount(),this.setStatus(`Loaded: ${e.name}`)}dispose(){this.editor.dispose(),this.uiRoot.remove()}getEditor(){return this.editor}}document.addEventListener("DOMContentLoaded",async()=>{const p=document.getElementById("game-canvas"),e=document.getElementById("loading"),t=document.getElementById("ui-overlay");if(!p||!t){console.error("Required elements not found!");return}let i=null,s=null,n=null,o=!1,a=null;const r=document.getElementById("progress-bar"),l=document.getElementById("progress-text"),d=document.getElementById("loading-status"),c=(h,u)=>{r&&(r.style.width=`${h}%`),l&&(l.textContent=`${h}%`),d&&(d.textContent=u)};try{i=new Ua(p),await i.init(c),await new Promise(h=>setTimeout(h,300)),e?.classList.add("hidden"),s=new Pa(t,{onStateChange:(h,u)=>{if(console.log(`State: ${h} -> ${u}`),u==="playing"?(p.style.display="block",i?.resume()):h==="playing"&&u!=="paused"&&i?.pause(),h==="editor"&&u!=="editor"&&(n&&(n.dispose(),n=null),p.style.display="block",window.dispatchEvent(new Event("resize"))),u==="editor"&&(p.style.display="none",!n)){const y={skipAutosaveCheck:!!a};n=new sr(t,{onExit:()=>{o=!1,a=null,s?.setState("menu")},onPlayTest:b=>{o=!0,a=b,s?.setPlayTesting(!0);const w=Ae.toGameLevel(b);i?.loadCustomLevel(w),i?.start(),s?.setState("playing")}},y),a&&n.loadLevel(a)}},onStartGame:h=>{console.log(`Starting level: ${h}`),i?.loadLevel(h),i?.start()},onPause:()=>{i?.pause()},onResume:()=>{i?.resume()},onRetry:()=>{const h=i?.getCurrentLevelId();h&&i?.loadLevel(h)},onQuit:()=>{i?.stop(),o&&a&&(o=!1,s?.setPlayTesting(!1),s?.setState("editor"))},onBackToEditor:()=>{i?.stop(),o=!1,s?.setPlayTesting(!1),s?.setState("editor")},onSkinChange:async h=>{await i?.changePlayerSkin(h)},onOpenEditor:()=>{}}),i.onLevelComplete=(h,u,y,b)=>{s?.endLevel(h,u,y,b)},s.setState("title"),window.game=i,window.gameState=s,console.log("🪑 Tony Stonks Pro Trader loaded!"),console.log("Press SPACE to start!")}catch(h){console.error("Failed to initialize game:",h),e&&(e.innerHTML=`
        <div style="color: #FF4444;">
          Failed to load game<br>
          <small>${h}</small>
        </div>
      `)}});
//# sourceMappingURL=main-D05epQxZ.js.map
