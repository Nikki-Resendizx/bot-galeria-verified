const { Telegraf } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, updateDoc, increment } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const firebaseConfig = { apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",authDomain:"galeria-verifiedmodels.firebaseapp.com",projectId:"galeria-verifiedmodels",storageBucket:"galeria-verifiedmodels.firebasestorage.app",messagingSenderId:"684551560793",appId:"1:684551560793:web:3730a07d8d6ec737e3db48"};
const fbApp = initializeApp(firebaseConfig); const db=getFirestore(fbApp);
const bot = new Telegraf(BOT_TOKEN);

async function getConfig(){
  try{ let s=await getDoc(doc(db,"config","bot")); if(s.exists()) return s.data(); }catch(e){}
  return null;
}
function replaceVars(str,m){
  if(!str) return "";
  let total=(m.votosMalo||0)+(m.votosBueno||0);
  let pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
  let servicios_lista = m.servicios?.map(s=>`• ${s}`).join('\n') || '• No especificado';
  return str.replaceAll('{perfil}',m.perfil||'').replaceAll('{username}',m.username||'').replaceAll('{edad}',m.edad||'').replaceAll('{nacionalidad}',m.nacionalidad||'').replaceAll('{servicios}',m.servicios?.join(' • ')||'-').replaceAll('{servicios_lista}',servicios_lista).replaceAll('{descripcion}',m.descripcion||'').replaceAll('{votos}',total).replaceAll('{porcentajeBueno}',pBueno).replaceAll('{porcentajeMalo}',100-pBueno).replaceAll('{id}',m.id||'').replaceAll('{canalFree}',m.canalFree||m.canal||'https://t.me/').replaceAll('{contacto}',m.contacto||m.linkContacto||`https://t.me/${m.username}`).replaceAll('{foto}',m.foto||'');
}
function buildKeyboard(btnsDef, modelo){
  let rowsMap={}; btnsDef.forEach(b=>{
    let text=replaceVars(b.text,modelo); let url=replaceVars(b.url||"",modelo); let data=replaceVars(b.data||"",modelo);
    let btn={text}; if(b.style) btn.style=b.style;
    if(b.type==='web_app') btn.web_app={url}; else if(b.type==='url') btn.url=url; else btn.callback_data=data;
    if(!rowsMap[b.row]) rowsMap[b.row]=[]; rowsMap[b.row].push(btn);
  });
  return Object.keys(rowsMap).sort().map(k=>rowsMap[k]);
}

async function mostrarModelo(ctx, modeloId){
  let snap=await getDoc(doc(db,"modelos",modeloId)); if(!snap.exists()) return ctx.reply("❌ No encontrada");
  let m={id:snap.id,...snap.data()}; let config=await getConfig();
  let plantilla=config?.plantilla_texto||"👑 {perfil}\n{servicios_lista}\n{descripcion}";
  let caption=replaceVars(plantilla,m);
  let kbDef=config?.plantilla_botones||[{text:"💖 VER PERFIL COMPLETO 💖",type:"web_app",url:WEBAPP_URL+"?m={id}",style:"primary",row:0}];
  let keyboard=buildKeyboard(kbDef,m);
  try{ await ctx.replyWithPhoto(m.foto,{caption,parse_mode:'HTML',reply_markup:{inline_keyboard:keyboard}}); }
  catch(e){ await ctx.reply(caption,{parse_mode:'HTML',reply_markup:{inline_keyboard:keyboard}}); }
}

bot.start(async(ctx)=>{
  if(ctx.startPayload?.startsWith('m_')) return mostrarModelo(ctx,ctx.startPayload.replace('m_',''));
  let config=await getConfig();
  let texto=config?.bienvenida_texto||"👑 GALERIA VERIFIED MODELS 👑";
  let media=config?.bienvenida_media||""; let kbDef=config?.bienvenida_botones||[{text:"💖 ABRIR GALERÍA 💖",type:"web_app",url:WEBAPP_URL,style:"primary",row:0}];
  let keyboard=buildKeyboard(kbDef,{});
  if(media){ try{ if(media.match(/\.(mp4|mov)$/i)) await ctx.replyWithVideo(media,{caption:texto,parse_mode:'HTML',reply_markup:{inline_keyboard:keyboard}}); else await ctx.replyWithPhoto(media,{caption:texto,parse_mode:'HTML',reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML',reply_markup:{inline_keyboard:keyboard}});
});

bot.action('lista',async(ctx)=>{
  await ctx.answerCbQuery(); let config=await getConfig();
  let porFila=config?.galeria_botones_por_fila||3; let estilos=config?.galeria_estilo_colores||["primary","success","danger"];
  let snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); if(snap.empty) return ctx.reply("Aún no hay modelos");
  let keyboard=[]; let row=[]; let i=0;
  snap.forEach(d=>{ let m=d.data(); let style=estilos[i%estilos.length]; row.push({text:`${m.perfil} @${m.username}`,callback_data:`ver_${d.id}`,style}); if(row.length===porFila){keyboard.push(row);row=[];} i++; });
  if(row.length>0) keyboard.push(row);
  let kbDef=config?.bienvenida_botones||[]; let extra=buildKeyboard(kbDef.filter(b=>b.data!=='lista'),{}); if(extra.length>0) keyboard.push(...extra);
  else keyboard.push([{text:"💖 ABRIR GALERÍA WEB 💖",web_app:{url:WEBAPP_URL},style:"primary"}]);
  await ctx.reply(`👑 GALERIA VERIFIED MODELS 👑\n💖 ${snap.size} modelos`,{reply_markup:{inline_keyboard:keyboard}});
});

bot.action(/ver_(.*)/,async(ctx)=>{ await ctx.answerCbQuery(); return mostrarModelo(ctx,ctx.match[1]); });
bot.action(/votar_(bueno|malo)_(.*)/,async(ctx)=>{
  await ctx.answerCbQuery("¡Voto registrado! ✅");
  let tipo=ctx.match[1]; let id=ctx.match[2];
  try{ await updateDoc(doc(db,"modelos",id),{ [tipo==='bueno'?'votosBueno':'votosMalo']: increment(1) }); }catch(e){}
  return mostrarModelo(ctx,id);
});

export default async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot control total OK');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
