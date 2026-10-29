import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(__dirname, { index: 'index.html' }));

app.get('/health', (_req, res) => res.json({ ok: true, imageAIConfigured: Boolean(openai) }));

const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 4,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.' }
});

app.post('/api/generate-design', generationLimiter, async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({ error: 'A geração por IA ainda não foi configurada pelo responsável da loja.' });
    }
    const { description, garment, color } = req.body ?? {};
    if (typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'Descreva a estampa antes de gerar.' });
    }
    if (description.length > 700) {
      return res.status(400).json({ error: 'A descrição deve ter no máximo 700 caracteres.' });
    }
    const allowedGarments = ['Camisa personalizada', 'Calça personalizada', 'Casaco personalizado'];
    const safeGarment = allowedGarments.includes(garment) ? garment : 'peça de roupa';
    const safeColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ffffff';
    const prompt = `Create an original apparel PRINT DESIGN based on the customer's description. Customer description: ${description.trim()}. Intended garment: ${safeGarment}. Garment base color reference: ${safeColor}. Output ONLY the standalone artwork, centered, isolated on a plain white background, no shirt, no model, no mockup, no scenery, no watermark. Make it clean, high contrast, print-ready, with clear silhouette and crisp details. If text is requested, include only the exact text explicitly requested by the customer; otherwise do not add lettering. Avoid brand logos and copyrighted character imitations.`;
    const result = await openai.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
      prompt,
      size: '1024x1024',
      quality: 'medium',
      output_format: 'png'
    });
    const imageBase64 = result.data?.[0]?.b64_json;
    if (!imageBase64) return res.status(502).json({ error: 'A IA não retornou uma imagem. Tente novamente.' });
    return res.json({ imageBase64, imageDataUrl: `data:image/png;base64,${imageBase64}` });
  } catch (error) {
    console.error('Falha ao gerar estampa:', error?.status || '', error?.message || 'erro desconhecido');
    return res.status(500).json({ error: 'Não foi possível gerar a estampa agora. Confira a configuração da IA e tente novamente.' });
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Almas Estampadas iniciada na porta ${port}`));
