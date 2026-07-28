const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

const MENSAGENS = {
  5:  { emoji: '😊', texto: 'só passando para lembrar: ainda faltam R$ {valor} da sua parte este mês.' },
  15: { emoji: '⏰', texto: 'estamos na metade do mês e ainda faltam R$ {valor}. Se possível, coloque as contas em dia.' },
  30: { emoji: '😅', texto: 'o mês tá quase acabando e você ainda tem R$ {valor} pendente!' }
};

async function enviarLembretes(dia) {
  const msg = MENSAGENS[dia];
  if (!msg) return;

  const casasSnap = await db.collection('casas').listDocuments();

  for (const casaRef of casasSnap) {
    try {
      const dadosSnap = await casaRef.collection('dados').doc('principal').get();
      if (!dadosSnap.exists) continue;
      let dados = {};
      try { dados = JSON.parse(dadosSnap.data().dados || '{}'); } catch { continue; }

      const pessoas = dados.pessoas || [];
      const contas = dados.contas || [];
      if (pessoas.length === 0 || contas.length === 0) continue;
      if (dados.mesFechado) continue;

      for (const pessoa of pessoas) {
        if (pessoa.pago) continue;
        if (!pessoa.fcmToken) continue;

        // Calcular valor pendente da pessoa
        let total = 0;
        for (const conta of contas) {
          const divisao = conta.divisao || [];
          const participa = divisao.includes(pessoa.id) || divisao.length === 0;
          if (!participa) continue;
          const qtd = divisao.length > 0 ? divisao.length : pessoas.length;
          total += (conta.valor || 0) / qtd;
        }

        if (total <= 0) continue;

        const valorFmt = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const body = `${msg.emoji} ${pessoa.nome}, ${msg.texto.replace('{valor}', valorFmt)}`;

        await messaging.send({
          token: pessoa.fcmToken,
          notification: {
            title: '🏠 Contas de Casa',
            body
          },
          android: { priority: 'high' },
          apns: { payload: { aps: { sound: 'default' } } }
        });
      }
    } catch (e) {
      console.error('Erro ao processar casa:', casaRef.id, e);
    }
  }
}

exports.lembretesDia5 = onSchedule('0 9 5 * *', () => enviarLembretes(5));
exports.lembretesDia15 = onSchedule('0 9 15 * *', () => enviarLembretes(15));
exports.lembretesDia30 = onSchedule('0 9 30 * *', () => enviarLembretes(30));
