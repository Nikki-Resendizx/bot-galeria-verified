const { Telegraf } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc, query, orderBy } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";

const firebaseConfig = {
  apiKey: "AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",
  authDomain: "galeria-verifiedmodels.firebaseapp.com",
  projectId: "galeria-verifiedmodels",
  storageBucket: "galeria-verifiedmodels.firebasestorage.app",
  messagingSenderId: "684551560793",
  appId: "1:684551560793:web:3730a07d8d6ec737e3db48"
};
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const bot = new Telegraf(BOT_TOKEN);

async function getConfig(){
  try{
    let s = await getDoc(doc(db,"config","bot"));
    if(s.exists()) return s.data();
  }catch(e){}
  return {
    bienvenida: "👑 <tg-emoji emoji-id=\"5368324170671202286\">👑</tg-emoji> GALERIA VERIFIED MODELS 👑\n\n💖 Las mejores modelos verificadas",
    plantilla: "👑 {perfil} 👑\n🆔 @{username} • {edad} años • {nacionalidad}\n\n💼 {servicios}\n\n📝 {descripcion}\n\n⭐ {votos} votos | 👍🏻 {porcentajeBueno}% | 👎🏻 {porcentajeMalo}%"
  };
}
function aplicarPlantilla(t,m){
  let total=(m.votosMalo||0)+(m.votosBueno||0);
  let pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
  return t.replaceAll('{perfil}',m.perfil||'').replaceAll('{username}',m.username||'').replaceAll('{edad}',m.edad||'').replaceAll('{nacionalidad}',m.nacionalidad||'').replaceAll('{servicios}',m.servicios?.join(' • ')||'-').replaceAll('{descripcion}',m.descripcion||'').replaceAll('{votos}',total).replaceAll('{porcentajeBueno}',pBueno).replaceAll('{porcentajeMalo}',100-pBueno);
}

// ESTILOS QUE PEDISTE
const STYLES = ['primary','success','danger']; // 🔵 🟢 🔴 rotando

async function mostrarModelo(ctx, modeloId) {
  let snap = await getDoc(doc(db, "modelos", modeloId));
  if (!snap.exists()) return ctx.reply("❌ No encontrada");
  let m = snap.data();
  let config = await getConfig();
  let caption = aplicarPlantilla(config.plantilla, m);

  let kb = {
    inline_keyboard: [
      [{ text: "💖 VER PERFIL COMPLETO 💖", web_app: { url: `${WEBAPP_URL}?m=${modeloId}` }, style: "primary" }],
      [{ text: "📋 Galería completa", callback_data: "lista", style: "success" }]
    ]
  };

  try { await ctx.replyWithPhoto(m.foto, { caption, parse_mode: 'HTML', reply_markup: kb }); }
  catch(e){ await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: kb }); }
}

bot.start(async (ctx) => {
  if(ctx.startPayload?.startsWith('m_')) return mostrarModelo(ctx, ctx.startPayload.replace('m_',''));
  let config = await getConfig();

  await ctx.reply(config.bienvenida, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: "💖 ABRIR GALERÍA 💖", web_app: { url: WEBAPP_URL }, style: "primary" }],
        [{ text: "📋 Ver lista 3x3 colores", callback_data: "lista", style: "success" }]
      ]
    }
  });
});

bot.action('lista', async (ctx) => {
  await ctx.answerCbQuery();
  let snap = await getDocs(query(collection(db, "modelos"), orderBy("fecha","desc")));
  if(snap.empty) return ctx.reply("Aún no hay modelos");

  let keyboard = [];
  let row = [];
  let i = 0;
  snap.forEach(d=>{
    let m = d.data();
    let style = STYLES[i % 3]; // 🔵 🟢 🔴 = primary, success, danger
    row.push({ text: `${m.perfil} @${m.username}`, callback_data: `ver_${d.id}`, style });
    if(row.length===3){ keyboard.push(row); row=[]; }
    i++;
  });
  if(row.length>0) keyboard.push(row);
  keyboard.push([{ text: "💖 ABRIR GALERÍA WEB 💖", web_app: { url: WEBAPP_URL }, style: "primary" }]);

  await ctx.reply(`👑 GALERIA VERIFIED MODELS 👑\n💖 ${snap.size} modelos\n🔵 primary 🟢 success 🔴 danger`, {
    reply_markup: { inline_keyboard: keyboard }
  });
});

bot.action(/ver_(.*)/, async (ctx) => {
  await ctx.answerCbQuery();
  return mostrarModelo(ctx, ctx.match[1]);
});

export default async (req, res) => {
  if(req.method==='GET') return res.status(200).send('Bot OK con colores 👑');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }
  catch(e){ console.error(e); return res.status(200).send('ok'); }
};
