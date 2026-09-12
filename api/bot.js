const { Telegraf } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, increment, updateDoc } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);
const fbApp = initializeApp({ apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",authDomain:"galeria-verifiedmodels.firebaseapp.com",projectId:"galeria-verifiedmodels",storageBucket:"galeria-verifiedmodels.firebasestorage.app",messagingSenderId:"684551560793",appId:"1:684551560793:web:3730a07d8d6ec737e3db48"});
const db=getFirestore(fbApp);
const bot = new Telegraf(BOT_TOKEN);

function isAdmin(ctx){ return ADMIN_IDS.length===0 || ADMIN_IDS.includes(String(ctx.from.id)); }
async function getConfig(){ try{ let s=await getDoc(doc(db,"config","bot")); if(s.exists()) return s.data(); }catch(e){} return {}; }
function getMencion(ctx){
  let name = (ctx.from.first_name || "amig@").replace(/</g,'').replace(/>/g,'');
  return `<a href="tg://user?id=${ctx.from.id}">${name}</a>`;
}
function replaceVars(str, m={}, ctx=null){
  if(!str) return "";
  let total=(m.votosMalo||0)+(m.votosBueno||0);
  let pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
  let lista=m.servicios?.map(s=>`• ${s}`).join('\n')||'• -';
  let mencion = ctx? getMencion(ctx) : "{mencion}";
  return str.replaceAll('{mencion}', mencion).replaceAll('{perfil}', m.perfil||'').replaceAll('{username}', m.username||'').replaceAll('{edad}', m.edad||'').replaceAll('{nacionalidad}', m.nacionalidad||'').replaceAll('{servicios}', m.servicios?.join(' • ')||'-').replaceAll('{servicios_lista}', lista).replaceAll('{descripcion}', m.descripcion||'').replaceAll('{votos}', total).replaceAll('{porcentajeBueno}', pBueno).replaceAll('{porcentajeMalo}', 100-pBueno).replaceAll('{id}', m.id||'').replaceAll('{canalFree}', m.canalFree||'https://t.me/').replaceAll('{contacto}', m.contacto||`https://t.me/${m.username||''}`);
}
function buildKeyboard(btnsDef, modelo={}, ctx=null){
  let rowsMap={};
  btnsDef.forEach(b=>{
    let text=replaceVars(b.text, modelo, ctx);
    let btn={text}; if(b.style) btn.style=b.style; if(b.icon_custom_emoji_id) btn.icon_custom_emoji_id=b.icon_custom_emoji_id;
    if(b.type==='web_app') btn.web_app={url: replaceVars(b.url||"", modelo, ctx)}; else if(b.type==='url') btn.url=replaceVars(b.url||"", modelo, ctx); else btn.callback_data=replaceVars(b.data||"", modelo, ctx);
    if(!rowsMap[b.row]) rowsMap[b.row]=[]; rowsMap[b.row].push(btn);
  });
  return Object.keys(rowsMap).sort().map(k=>rowsMap[k]);
}
async function borrarYEnviar(ctx, sendFn){
  try{ await ctx.deleteMessage(); }catch(e){}
  return await sendFn();
}
let esperando={};

// START
bot.start(async(ctx)=>{
  console.log("START", ctx.from.id);
  let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 𝘼𝘽𝙍𝙄𝙍 𝙂𝘼𝙇𝙀𝙍𝙄𝘼 𝙑𝙄𝙍𝙏𝙐𝘼𝙇 💖", type:"web_app", url:WEBAPP_URL, style:"success", row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
  let media = c.bienvenida_media || c.bienvenida_media_file_id;
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

bot.command('admin', async(ctx)=>{
  if(!isAdmin(ctx)) return ctx.reply("❌ No eres admin");
  await ctx.reply(`👑 PANEL ADMIN`,{reply_markup:{inline_keyboard:[[{text:"🌐 PANEL WEB", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}}]]}});
});

bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery(); });
bot.action('panel_galeria', async(ctx)=>{ await ctx.answerCbQuery(); });
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); });
bot.action('panel_plantillas', async(ctx)=>{ await ctx.answerCbQuery(); });
bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); await ctx.reply("/admin"); });
bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda FOTO"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto con {mencion} y emoji premium si quieres"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERÍA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galería"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda UN emoji premium"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla {mencion} {perfil} {votos} etc"); });

bot.on(['photo','document'], async(ctx, next)=>{
  if(!isAdmin(ctx)) return next();
  let fileId = ctx.message.photo? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.document.file_id;
  let st=esperando[ctx.from.id];
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galería"); }
  return next();
});

// === FIX PREMIUM AUTO DETECT ===
bot.on('text', async(ctx, next)=>{
  let txt=ctx.message.text;
  if(txt.startsWith('/')) return next();
  if(!isAdmin(ctx)) return next();
  let st=esperando[ctx.from.id]; if(!st) return next();
  let ent=ctx.message.entities||[];
  let customEmojis = ent.filter(e=>e.type==='custom_emoji').map(e=>e.custom_emoji_id);
  let firstEmoji = customEmojis[0] || "";

  if(st==='texto_bienvenida'){
    await setDoc(doc(db,"config","bot"),{bienvenida_texto:txt, bienvenida_premium_ids:customEmojis, bienvenida_emoji_premium:firstEmoji},{merge:true});
    delete esperando[ctx.from.id];
    return ctx.reply(`✅ Texto guardado${firstEmoji?` + premium ${firstEmoji} detectado ✅`:''}`);
  }
  if(st==='texto_galeria'){
    await setDoc(doc(db,"config","bot"),{galeria_texto:txt, galeria_texto_premium_ids:customEmojis},{merge:true});
    delete esperando[ctx.from.id];
    return ctx.reply(`✅ Texto galería guardado${firstEmoji?` + premium detectado`:''}`);
  }
  if(st==='emoji_galeria'){
    let id=firstEmoji || txt;
    await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:id},{merge:true});
    delete esperando[ctx.from.id];
    return ctx.reply(`✅ Emoji premium guardado: ${id}`);
  }
  if(st==='texto_plantilla'){
    await setDoc(doc(db,"config","bot"),{plantilla_texto:txt, plantilla_premium_ids:customEmojis},{merge:true});
    delete esperando[ctx.from.id];
    return ctx.reply(`✅ Plantilla guardada${customEmojis.length?` + ${customEmojis.length} premium detectados`:''}`);
  }
});

// === LISTA CON COLORES Y BORRANDO MENSAJE ===
bot.action('lista', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let c=await getConfig();
  let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}\nElige una chica 👇", {}, ctx);
  let snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc")));

  let keyboard=[]; let row=[];
  let colores = ["primary","danger","success"]; // azul, rojo, verde
  let filaIndex = 0;

  snap.forEach((d)=>{
    let m=d.data();
    let color = colores[Math.floor(filaIndex/2) % colores.length]; // cada 2 botones cambia color: 2 azules, 2 rojos, 2 verdes...
    let btn={text:`${m.perfil}`, callback_data:`ver_${d.id}`, style:color};
    if(c.galeria_emoji_premium) btn.icon_custom_emoji_id=c.galeria_emoji_premium;
    row.push(btn);
    if(row.length===2){ keyboard.push(row); row=[]; filaIndex+=2; }
  });
  if(row.length>0) keyboard.push(row);
  keyboard.push([{text:"💖 ABRIR GALERÍA WEB", web_app:{url:WEBAPP_URL}, style:"success"}]);
  keyboard.push([{text:"🏠 Inicio", callback_data:"inicio", style:"primary"}]);

  let media = c.galeria_media || c.galeria_media_file_id;
  await borrarYEnviar(ctx, async()=>{
    if(media) return await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
    else return await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
  });
});

bot.action('inicio', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 𝘼𝘽𝙍𝙄𝙍 𝙂𝘼𝙇𝙀𝙍𝙄𝘼 𝙑𝙄𝙍𝙏𝙐𝘼𝙇 💖", type:"web_app", url:WEBAPP_URL, style:"success", row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
  let media = c.bienvenida_media || c.bienvenida_media_file_id;
  await borrarYEnviar(ctx, async()=>{
    if(media) return await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
    else return await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  });
});

// === VER MODELO - FOTO REAL + VOTOS ===
bot.action(/ver_(.*)/, async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let id = ctx.match[1].split('_')[0]; // quita sufijos _foto_1 etc
  let snap=await getDoc(doc(db,"modelos",id)); if(!snap.exists()) return;
  let m={id:snap.id,...snap.data()};
  let c=await getConfig();
  let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}\nVotos: {votos} 👍 {porcentajeBueno}%", m, ctx);

  // Foto: usa foto principal o si tiene fotos array
  let fotos = m.fotos || m.galeria || [];
  let media = m.foto || m.foto_url || m.foto_file_id || (fotos[0] || null);

  let kb=buildKeyboard(c.plantilla_botones||[{text:"💖 VER PERFIL", type:"web_app", url:WEBAPP_URL+"?m={id}", style:"primary", row:0}], m, ctx);
  // Botones votos
  kb.push([
    {text:`👍 ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"},
    {text:`👎 ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}
  ]);
  kb.push([{text:"⬅️ Volver", callback_data:"lista", style:"primary"}, {text:"🏠 Inicio", callback_data:"inicio", style:"primary"}]);

  await borrarYEnviar(ctx, async()=>{
    if(media) return await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
    else return await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  });
});

// VOTOS FUNCIONANDO
bot.action(/voto_(bueno|malo)_(.*)/, async(ctx)=>{
  await ctx.answerCbQuery("Voto guardado ✅").catch(()=>{});
  let tipo = ctx.match[1]; let id = ctx.match[2];
  try{
    let ref = doc(db,"modelos",id);
    if(tipo==='bueno') await updateDoc(ref,{votosBueno: increment(1)}).catch(async()=>{ await setDoc(ref,{votosBueno:1},{merge:true}); });
    else await updateDoc(ref,{votosMalo: increment(1)}).catch(async()=>{ await setDoc(ref,{votosMalo:1},{merge:true}); });

    let snap=await getDoc(ref); let m={id:snap.id,...snap.data()}; let c=await getConfig();
    let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}\nVotos: {votos} 👍 {porcentajeBueno}%", m, ctx);
    let media = m.foto || m.foto_url || (m.fotos && m.fotos[0]) || null;
    let kb=buildKeyboard(c.plantilla_botones||[{text:"💖 VER PERFIL", type:"web_app", url:WEBAPP_URL+"?m={id}", row:0}], m, ctx);
    kb.push([
      {text:`👍 ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"},
      {text:`👎 ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}
    ]);
    kb.push([{text:"⬅️ Volver", callback_data:"lista"}, {text:"🏠 Inicio", callback_data:"inicio"}]);

    await borrarYEnviar(ctx, async()=>{
      if(media) return await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
      else return await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
    });
  }catch(e){ console.error("voto error", e.message); }
});

bot.action('preview_start', async(ctx)=>{
  await ctx.answerCbQuery(); let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion}", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[], {}, ctx);
  let media = c.bienvenida_media || c.bienvenida_media_file_id;
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK - colores + premium + votos + borra anterior');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
