/**
 * eneagramaCalc.js
 * Calcula el Eneatipo, Alas y Líneas/Flechas a partir de las respuestas del test.
 *
 * Mapeo directo sección → tipo:
 *   PI=1, PII=2, PIII=3, PIV=4, PV=5, PVI=6, PVII=7, PVIII=8, PIX=9
 *
 * Criterio de alas: los DOS tipos con mayor score después del tipo base,
 * independientemente de su posición en la rueda.
 */

(function () {
  'use strict';

  const SECCION_A_TIPO = {
    'PI':    1,
    'PII':   2,
    'PIII':  3,
    'PIV':   4,
    'PV':    5,
    'PVI':   6,
    'PVII':  7,
    'PVIII': 8,
    'PIX':   9,
  };

  /**
   * Parsea el string de respuestas.
   * Orden más largo primero para evitar match parcial (PVIII antes que PVII, etc.)
   */
  function parseRespuestas(rawString) {
    const result = {};
    const sectionRegex = /\{(PVIII|PVII|PIX|PVI|PIV|PIII|PII|PV|PI)\s*:[^-]*-([^}]+)\}/g;
    let match;
    while ((match = sectionRegex.exec(rawString)) !== null) {
      const secName  = match[1].trim();
      const pairsStr = match[2].trim();
      const pairs    = {};
      pairsStr.split(',').forEach(p => {
        const parts = p.trim().split(';');
        if (parts.length === 2) {
          const id  = parseInt(parts[0], 10);
          const val = parseInt(parts[1], 10);
          if (!isNaN(id) && !isNaN(val)) pairs[id] = val;
        }
      });
      result[secName] = pairs;
    }
    return result;
  }

  /**
   * Calcula scores normalizados 0-100.
   * Score = suma respuestas / (n × 5) × 100
   */
  function calcularScores(parsedRespuestas) {
    const raw        = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0 };
    const counts     = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0 };
    const normalized = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0 };

    Object.entries(SECCION_A_TIPO).forEach(([seccion, tipo]) => {
      const resp = parsedRespuestas[seccion];
      if (!resp) return;
      const valores    = Object.values(resp);
      const suma       = valores.reduce((acc, v) => acc + (isNaN(v) ? 0 : v), 0);
      const total      = valores.length;
      raw[tipo]        = suma;
      counts[tipo]     = total;
      const max        = total * 5;
      normalized[tipo] = max > 0 ? Math.round((suma / max) * 100) : 0;
    });

    return { raw, normalized, counts };
  }

  /**
   * Determina tipo base, alas y flechas.
   *
   * Tipo base  = tipo con mayor score.
   * Ala 1      = tipo con 2° mayor score (excluyendo el base).
   * Ala 2      = tipo con 3° mayor score (excluyendo el base y ala1).
   * Ala dominante = ala con mayor score (siempre ala1 por definición del orden).
   */
  function determinarResultado(normalized) {
    // Ordenar todos los tipos de mayor a menor score
    const ranking = Object.entries(normalized)
      .map(([t, s]) => ({ tipo: parseInt(t), score: s }))
      .sort((a, b) => b.score - a.score);

    const base       = ranking[0].tipo;
    const ala1       = ranking[1].tipo;  // 2° más alto = ala dominante
    const ala2       = ranking[2].tipo;  // 3° más alto = ala secundaria
    const alaScore1  = ranking[1].score;
    const alaScore2  = ranking[2].score;
    const alaDominante = ala1; // ala1 siempre tiene mayor o igual score que ala2

    const FLECHAS = {
      1: { integracion: 7,  desintegracion: 4 },
      2: { integracion: 4,  desintegracion: 8 },
      3: { integracion: 6,  desintegracion: 9 },
      4: { integracion: 1,  desintegracion: 2 },
      5: { integracion: 8,  desintegracion: 7 },
      6: { integracion: 9,  desintegracion: 3 },
      7: { integracion: 5,  desintegracion: 1 },
      8: { integracion: 2,  desintegracion: 5 },
      9: { integracion: 3,  desintegracion: 6 },
    };

    return {
      base,
      ala1,
      ala2,
      alaDominante,
      alaScore1,
      alaScore2,
      integracion:    FLECHAS[base].integracion,
      desintegracion: FLECHAS[base].desintegracion,
      scores: normalized,
    };
  }

  function calcularEneagrama(rawRespuestas) {
    const parsed = parseRespuestas(rawRespuestas);
    const { normalized, raw, counts } = calcularScores(parsed);
    const resultado = determinarResultado(normalized);
    return { ...resultado, rawScores: raw, counts };
  }

  window.EneagramaCalc = { calcularEneagrama, parseRespuestas, calcularScores };

})();