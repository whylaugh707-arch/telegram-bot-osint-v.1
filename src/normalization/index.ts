/**
 * OSINT Nexus - Normalization & Classification Layer
 * Handles robust parsing, canonicalization, and categorization of input vectors.
 */

import { IPAddressType, NormalizedValue, TargetClassification } from '../models/types';
import net from 'net';

export class Normalizer {

  /**
   * Classify input target cleanly without naive assumptions
   */
  public static classifyTarget(input: string): TargetClassification {
    const raw = (input || '').trim();
    if (!raw) return 'unknown';

    // 1. IP Check
    if (net.isIP(raw)) {
      return net.isIPv4(raw) ? 'ipv4' : 'ipv6';
    }

    // 2. Email Check
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (emailRegex.test(raw)) {
      return 'email';
    }

    // 3. Phone Check (+62..., 08..., etc.)
    const phoneClean = raw.replace(/[\s\-\(\)\.]/g, '');
    if (/^(\+?[0-9]{8,15})$/.test(phoneClean) && (phoneClean.startsWith('+') || phoneClean.startsWith('0') || phoneClean.startsWith('62'))) {
      return 'phone';
    }

    // 4. Domain Check
    const cleanDomain = raw.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').split('/')[0].split(':')[0].toLowerCase();
    const domainRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
    if (cleanDomain.includes('.') && domainRegex.test(cleanDomain) && !raw.includes(' ')) {
      return 'domain';
    }

    // 5. Full Person Name (contains spaces and letters only)
    if (/^[a-zA-Z\s.'’-]{4,60}$/.test(raw) && raw.trim().includes(' ')) {
      return 'person_name';
    }

    // 6. Default to Username
    return 'username';
  }

  /**
   * Strict IP Classification & Validation
   */
  public static normalizeIP(ip: string): { normalized: string; type: IPAddressType; version: 4 | 6 } | null {
    const clean = (ip || '').trim();
    const version = net.isIP(clean);
    if (version === 0) return null;

    if (version === 4) {
      const parts = clean.split('.').map(p => parseInt(p, 10));
      if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return null;
      }

      let type: IPAddressType = 'PUBLIC';
      const [a, b] = parts;

      // Loopback (127.0.0.0/8)
      if (a === 127) type = 'LOOPBACK';
      // Private RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
      else if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) type = 'PRIVATE';
      // Link Local (169.254.0.0/16)
      else if (a === 169 && b === 254) type = 'LINK_LOCAL';
      // Documentation RFC 5737 (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
      else if ((a === 192 && b === 0 && parts[2] === 2) || (a === 198 && b === 51 && parts[2] === 100) || (a === 203 && b === 0 && parts[2] === 113)) type = 'DOCUMENTATION';
      // Reserved / Broadcast / Multicast
      else if (a === 0 || a >= 224) type = 'RESERVED';

      return {
        normalized: parts.join('.'),
        type,
        version: 4
      };
    }

    // IPv6
    const isLoopback = clean === '::1' || clean === '0:0:0:0:0:0:0:1';
    return {
      normalized: clean.toLowerCase(),
      type: isLoopback ? 'LOOPBACK' : 'PUBLIC',
      version: 6
    };
  }

  /**
   * Domain & URL Normalization
   */
  public static normalizeDomain(rawDomain: string): NormalizedValue<string> {
    const cleaned = (rawDomain || '').trim();
    let host = cleaned;

    try {
      if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        const u = new URL(cleaned);
        host = u.hostname;
      } else {
        const u = new URL(`http://${cleaned}`);
        host = u.hostname;
      }
    } catch {
      host = cleaned.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').split('/')[0].split(':')[0];
    }

    host = host.toLowerCase().replace(/\.$/, '');
    return {
      raw: rawDomain,
      normalized: host,
      method: 'URL_HOSTNAME_EXTRACTION_AND_LOWERCASE'
    };
  }

  /**
   * Email Normalization (RFC standard + Gmail dot removal for canonical entity clustering)
   */
  public static normalizeEmail(rawEmail: string): NormalizedValue<{ address: string; user: string; domain: string; canonicalUser: string }> {
    const clean = (rawEmail || '').trim().toLowerCase();
    const parts = clean.split('@');
    if (parts.length !== 2) {
      return {
        raw: rawEmail,
        normalized: { address: clean, user: clean, domain: '', canonicalUser: clean },
        method: 'INVALID_EMAIL_PASSTHROUGH'
      };
    }

    const user = parts[0];
    const domain = parts[1].replace(/\.$/, '');

    // Canonical representation (Gmail ignores dots and +plus tags)
    let canonicalUser = user;
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      canonicalUser = user.split('+')[0].replace(/\./g, '');
    }

    return {
      raw: rawEmail,
      normalized: {
        address: `${user}@${domain}`,
        user,
        domain,
        canonicalUser
      },
      method: 'EMAIL_CANONICAL_RFC_DECOMPOSE'
    };
  }

  /**
   * Username Normalization
   */
  public static normalizeUsername(rawUser: string): NormalizedValue<{ standard: string; canonicalKey: string }> {
    const clean = (rawUser || '').trim().replace(/^@+/, '');
    const standard = clean.toLowerCase();
    const canonicalKey = standard.replace(/[^a-z0-9]/g, '');

    return {
      raw: rawUser,
      normalized: {
        standard,
        canonicalKey
      },
      method: 'LOWERCASE_AND_STRIP_PUNCTUATION_CANONICAL'
    };
  }

  /**
   * Person Full Name Normalization
   */
  public static normalizeName(rawName: string): NormalizedValue<{ standard: string; tokens: string[]; initials: string }> {
    const clean = (rawName || '').trim().replace(/\s+/g, ' ');
    // Remove common prefixes/suffixes: Dr., Ir., S.Kom, M.T, Ph.D, etc.
    const stripped = clean.replace(/^(?:mr\.|ms\.|mrs\.|dr\.|prof\.|ir\.|drs\.)\s+/i, '')
                          .replace(/,\s*(?:s\.kom|m\.kom|s\.t|m\.t|ph\.d|m\.sc|b\.sc|se|sh|mm|mba)\.?$/i, '')
                          .trim();
    
    const tokens = stripped.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const initials = tokens.map(t => t[0] || '').join('');

    return {
      raw: rawName,
      normalized: {
        standard: stripped,
        tokens,
        initials
      },
      method: 'TITLES_REMOVAL_AND_TOKENIZATION'
    };
  }
}
