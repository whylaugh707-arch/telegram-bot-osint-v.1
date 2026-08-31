import { Router } from 'express';
import { evidenceEngine } from '../services/evidenceEngine';
import { Normalizer } from '../normalization';
import { generateDorkMatrix } from '../services/correlator';

const router = Router();

/**
 * GET /api/osint/correlate
 * Evidence-Driven OSINT Correlation Pipeline API
 */
router.get('/correlate', async (req, res) => {
  try {
    const target = String(req.query.target || req.query.q || '').trim();
    if (!target) {
      return res.status(400).json({ error: 'Query parameter "target" or "q" is required.' });
    }

    const report = await evidenceEngine.investigate(target);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({
      error: 'Investigation pipeline failure',
      details: err.message || String(err)
    });
  }
});

/**
 * GET /api/osint/analyze
 * Alias for correlation engine returning evidence report
 */
router.get('/analyze', async (req, res) => {
  try {
    const target = String(req.query.target || req.query.q || '').trim();
    if (!target) {
      return res.status(400).json({ error: 'Target query parameter required' });
    }

    const report = await evidenceEngine.investigate(target);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/osint/ip
 * Single Vector IP Normalization & Intelligence
 */
router.get('/ip', async (req, res) => {
  const ip = String(req.query.query || req.query.ip || '').trim();
  const normalized = Normalizer.normalizeIP(ip);
  if (!normalized) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }

  const report = await evidenceEngine.investigate(normalized.normalized);
  return res.json(report);
});

/**
 * GET /api/osint/domain
 * Single Vector Domain Intelligence
 */
router.get('/domain', async (req, res) => {
  const domain = String(req.query.domain || req.query.q || '').trim();
  if (!domain) {
    return res.status(400).json({ error: 'Domain query parameter required' });
  }

  const report = await evidenceEngine.investigate(domain);
  return res.json(report);
});

/**
 * GET /api/osint/email
 * Single Vector Email Intelligence
 */
router.get('/email', async (req, res) => {
  const email = String(req.query.email || req.query.q || '').trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  const report = await evidenceEngine.investigate(email);
  return res.json(report);
});

export default router;
