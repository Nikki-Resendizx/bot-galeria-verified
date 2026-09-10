const { Telegraf, Markup } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc, query, orderBy } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://t.me/galeriaVerifiedModels_Bot/Galeria";

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

async function mostrarModelo(ctx, modeloId) {
  try {
    let snap = await getDoc(doc(db, "modelos", modeloId));
    if (!snap.exists()) return ctx.reply("❌ Modelo no encontrada");
    let m = snap.data();
    let total = (m.votosMalo||0)+(m.votosBueno||0);
    let pBueno = total? Math.round((m.votosBueno||0)/total*100) : 0;
    let pMalo = 100 - pBueno;
    let caption = `👑 *${m.perfil}* 👑\n🆔 @${m.username} • ${m.edad} años • ${m.nacionalidad}\n\n💼 *Servicios:* ${m.servicios?.join(' • ') || '-'}\n\n📝 ${m.descripcion}\n\n⭐ *Votos:* ${total} votos\n👍🏻 ${pBueno}% Bueno | 👎🏻 ${pMalo}% Malo`;
    await ctx.replyWithPhoto({ url: m.foto }, {
      caption, parse_mode: 'Markdown',
     ...Markup.inlineKeyboard([
        [Markup.button.webApp('💖 VER PERFIL COMPLETO 💖', WEBAPP_URL)],
        [Markup.button.url('💬 Canal Free', m.canal_free || 'https://t.me/')],
        [Markup.button.callback('📋 Galería completa', 'lista')]
      ])
    });
  } catch(e){ await ctx.reply("Error: "+e.message) }
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;
  if (payload && payload.startsWith('m_')) {
    return mostrarModelo(ctx, payload.replace('m_', ''));
  }
  await ctx.reply(`👑 *BIENVENIDA A GALERÍA VERIFIED MODELS* 👑\n\n💖 Las mejores modelos verificadas\n\n👇 Entra a la galería:`, {
    parse_mode: 'Markdown',
   ...Markup.inlineKeyboard([
      [Markup.button.webApp('💖 ABRIR GALERÍA 💖', WEBAPP_URL)],
      [Markup.button.callback('📋 Ver lista aquí', 'lista')]
    ])
  });
});

bot.action('lista', async (ctx) => {
  await ctx.answerCbQuery();
  let q = query(collection(db, "modelos"), orderBy("fecha","desc"));
  let snap = await getDocs(q);
  if(snap.empty) return ctx.reply("Aún no hay modelos 😢");
  let botones = [];
  snap.forEach(d=>{
    let m = d.data();
    botones.push([Markup.button.callback(`👑 ${m.perfil} @${m.username}`, `ver_${d.id}`)]);
  });
  botones.push([Markup.button.webApp('💖 ABRIR GALERÍA WEB 💖', WEBAPP_URL)]);
  await ctx.reply(`👑 *GALERÍA VERIFIED MODELS* 👑\n💖 ${snap.size} modelos\n👇 Toca para ver:`, {
    parse_mode: 'Markdown',...Markup.inlineKeyboard(botones)
  });
});

bot.action(/ver_(.*)/, async (ctx) => {
  await ctx.answerCbQuery();
  return mostrarModelo(ctx, ctx.match[1]);
});

bot.command('galeria', (ctx) => {
  ctx.reply(`👑 Galería aquí 👇`, Markup.inlineKeyboard([
    [Markup.button.webApp('💖 ABRIR GALERÍA 💖', WEBAPP_URL)]
  ]));
});

// FIX PARA VERCEL - ESTO ERA EL ERROR
export default async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).send('Bot Galeria Verified OK 👑');
  }
  try {
    await bot.handleUpdate(req.body);
    return res.status(200).send('ok');
  } catch(e){
    console.error(e);
    return res.status(200).send('ok');
  }
};
