const { Telegraf } = require('telegraf');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);

let fbApp; if(!getApps().length){ fbApp = initializeApp({ apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",authDomain:"galeria-verifiedmodels.firebaseapp.com",projectId:"galeria-verifiedmodels",storageBucket:"galeria-verifiedmodels.firebasestorage.app",messagingSenderId:"684551560793",appId:"1:684551560793:web:3730a07d8d6ec737e3db48"}); } else { fbApp = getApps()[0]; }
const db=getFirestore(fbApp);
const bot = new Telegraf(BOT_TOKEN);

function isAdmin(ctx){ return ADMIN_IDS.length===0 || ADMIN_IDS.includes(String(ctx.from.id)); }
let cacheConfig=null; let cacheTime=0;
async function getConfig(){
  if(cacheConfig && Date.now()-cacheTime < 10000) return cacheConfig;
  try{ let s=await getDoc(doc(db,"config","bot")); if(s.exists()){ cacheConfig=s.data(); cacheTime=Date.now(); return cacheConfig; } }catch(e){}
  return cacheConfig||{};
}
function getMencion(ctx){
  if(!ctx ||!ctx.from) return "👋";
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
    let btn={text}; if(b.icon_custom_emoji_id) btn.icon_custom_emoji_id=b.icon_custom_emoji_id;
    if(b.type==='web_app') btn.web_app={url: replaceVars(b.url||"", modelo, ctx)}; else if(b.type==='url') btn.url=replaceVars(b.url||"", modelo, ctx); else btn.callback_data=replaceVars(b.data||"", modelo, ctx);
    if(!rowsMap[b.row]) rowsMap[b.row]=[]; rowsMap[b.row].push(btn);
  });
  return Object.keys(rowsMap).sort().map(k=>rowsMap[k]);
}
let esperando={};

// START - BLINDADO
bot.start(async(ctx)=>{
  try{
    console.log("START", ctx.from.id);
    let c={}; try{ c=await getConfig(); }catch(e){}
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", row:1}], {}, ctx);
    let media = c.bienvenida_media || c.bienvenida_media_file_id;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("START ERROR", e); try{ await ctx.reply("Hola 👑 bienvenid@"); }catch(e){} }
});

bot.command('admin', async(ctx)=>{
  if(!isAdmin(ctx)) return ctx.reply("❌ No eres admin");
  await ctx.reply(`👑 PANEL`,{reply_markup:{inline_keyboard:[[{text:"🌐 PANEL WEB", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}}]]}});
});

bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery(); });
bot.action('panel_galeria', async(ctx)=>{ await ctx.answerCbQuery(); });
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); await ctx.reply(`Usuarios: ${snap.size}`); });
bot.action('panel_plantillas', async(ctx)=>{ await ctx.answerCbQuery(); });
bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); await ctx.reply("/admin"); });
bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda FOTO"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto {mencion}"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda emoji premium"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla"); });

bot.on(['photo','document'], async(ctx, next)=>{
  if(!isAdmin(ctx)) return next();
  let fileId = ctx.message.photo? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.document.file_id;
  let st=esperando[ctx.from.id];
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId},{merge:true}); cacheConfig=null; delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId},{merge:true}); cacheConfig=null; delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galería guardada"); }
  return next();
});

bot.on('text', async(ctx, next)=>{
  let txt=ctx.message.text; if(txt.startsWith('/')) return next();
  if(!isAdmin(ctx)) return next();
  let st=esperando[ctx.from.id]; if(!st) return next();
  let ent=ctx.message.entities||[];
  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:txt},{merge:true}); cacheConfig=null; delete esperando[ctx.from.id]; return ctx.reply("✅ Guardado"); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:txt},{merge:true}); cacheConfig=null; delete esperando[ctx.from.id]; return ctx.reply("✅ Guardado"); }
  if(st==='emoji_galeria'){ let id=txt; for(let e of ent){ if(e.type==='custom_emoji') id=e.custom_emoji_id; } await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:id},{merge:true}); cacheConfig=null; delete esperando[ctx.from.id]; return ctx.reply("✅ Emoji"); }
  if(st==='texto_plantilla'){ await setDoc(doc(db,"config","bot"),{plantilla_texto:txt},{merge:true}); cacheConfig=null; delete esperando[ctx.from.id]; return ctx.reply("✅ Plantilla"); }
});

// === FIX VER LISTA - MISMO MENSAJE - SOLO NOMBRE ===
bot.action('lista', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  try{
    let c=await getConfig();
    let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}\nElige una chica 👇", {}, ctx);
    let snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc")));
    let keyboard=[]; let row=[];
    snap.forEach(d=>{
      let m=d.data();
      row.push({text: `${m.perfil}`, callback_data:`ver_${d.id}`}); // SOLO NOMBRE
      if(row.length===2){ keyboard.push(row); row=[]; }
    });
    if(row.length>0) keyboard.push(row);
    keyboard.push([{text:"💖 ABRIR GALERÍA WEB", web_app:{url:WEBAPP_URL}}]);
    keyboard.push([{text:"🏠 Inicio", callback_data:"inicio"}]);

    // Solo edita caption - no cambia foto, por eso no falla
    await ctx.editMessageCaption(texto, {parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}).catch(async(e)=>{
      // Si el mensaje original era de texto, edita texto
      await ctx.editMessageText(texto, {parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}).catch(async()=>{
        try{ await ctx.deleteMessage(); }catch(e){}
        let media = c.galeria_media || c.galeria_media_file_id;
        if(media) await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
        else await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
      });
    });
  }catch(e){ console.error("lista", e.message); }
});

bot.action('inicio', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  try{
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", row:1}], {}, ctx);
    let media = c.bienvenida_media || c.bienvenida_media_file_id;
    try{
      if(media) await ctx.editMessageMedia({type:'photo', media:media, caption:texto, parse_mode:'HTML'}, {reply_markup:{inline_keyboard:kb}});
      else await ctx.editMessageText(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
    }catch(e){
      try{ await ctx.editMessageCaption(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e2){
        try{ await ctx.deleteMessage(); }catch(e){}
        if(media) await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
        else await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
      }
    }
  }catch(e){ console.error("inicio", e.message); }
});

bot.action(/ver_(.*)/, async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  try{
    let snap=await getDoc(doc(db,"modelos",ctx.match[1])); if(!snap.exists()) return;
    let m={id:snap.id,...snap.data()}; let c=await getConfig();
    let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}", m, ctx);
    let kb=buildKeyboard(c.plantilla_botones||[{text:"💖 VER PERFIL", type:"web_app", url:WEBAPP_URL+"?m={id}", row:0}], m, ctx);
    kb.push([{text:"⬅️ Volver", callback_data:"lista"}, {text:"🏠 Inicio", callback_data:"inicio"}]);
    let media = m.foto || m.foto_url || m.foto_file_id;
    await ctx.editMessageMedia({type:'photo', media:media, caption:caption, parse_mode:'HTML'}, {reply_markup:{inline_keyboard:kb}}).catch(async()=>{
      try{ await ctx.editMessageCaption(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e){
        try{ await ctx.deleteMessage(); }catch(e){}
        try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e){ await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }
      }
    });
  }catch(e){ console.error("ver_", e.message); }
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
  if(req.method==='GET') return res.status(200).send('Bot OK - FIX VER LISTA');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
