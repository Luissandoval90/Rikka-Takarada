#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import PhoneValidator from './PhoneValidator.js';

/**
 * Script para analizar y corregir números telefónicos en el archivo lidsresolve.json
 */
class PhoneAnalyzer {
  constructor() {
    this.phoneValidator = new PhoneValidator();
    this.cacheFile = path.join(process.cwd(), 'src', 'lidsresolve.json');
    this.backupFile = path.join(process.cwd(), 'src', 'lidsresolve.backup.json');
  }

  /**
   * Cargar datos del archivo JSON
   */
  loadData() {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        console.error(`❌ Archivo no encontrado: ${this.cacheFile}`);
        return null;
      }

      const data = fs.readFileSync(this.cacheFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error cargando datos:', error.message);
      return null;
    }
  }

  /**
   * Guardar datos al archivo JSON
   */
  saveData(data) {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error guardando datos:', error.message);
    }
  }

  /**
   * Crear respaldo del archivo original
   */
  createBackup(data) {
    try {
      fs.writeFileSync(this.backupFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error creando respaldo:', error.message);
    }
  }

  /**
   * Analizar todas las entradas del archivo
   */
  analyzeEntries(data) {
    const analysis = {
      phoneNumbers: [],
      realLids: [],
      problematic: [],
      correctable: []
    };

    for (const [lidKey, entry] of Object.entries(data)) {
      const phoneDetection = this.phoneValidator.detectPhoneInLid(lidKey);
      
      if (phoneDetection.isPhone) {
        const countryInfo = this.phoneValidator.getCountryInfo(phoneDetection.phoneNumber);
        const isProblematic = entry.notFound || entry.error || entry.jid.includes('@lid');
        
        const phoneEntry = {
          lidKey,
          phoneNumber: phoneDetection.phoneNumber,
          correctJid: phoneDetection.jid,
          currentJid: entry.jid,
          country: countryInfo?.country || 'Desconocido',
          countryCode: countryInfo?.code,
          isProblematic,
          entry
        };

        analysis.phoneNumbers.push(phoneEntry);
        
        if (isProblematic) {
          analysis.correctable.push(phoneEntry);
        }
      } else {
        analysis.realLids.push({
          lidKey,
          entry
        });
      }

      // Detectar otros problemas
      if (entry.jid && entry.jid.includes('@lid')) {
        analysis.problematic.push({
          lidKey,
          issue: 'JID contiene @lid',
          entry
        });
      }
    }

    return analysis;
  }

  /**
   * Generar reporte detallado (solo para modo verbose)
   */
  generateReport(analysis, verbose = false) {
    if (!verbose) return;

    console.log('\n📊 === REPORTE DE ANÁLISIS ===\n');
    
    console.log(`Total de entradas: ${analysis.phoneNumbers.length + analysis.realLids.length}`);
    console.log(`📞 Números telefónicos detectados: ${analysis.phoneNumbers.length}`);
    console.log(`🔗 LIDs reales: ${analysis.realLids.length}`);
    console.log(`⚠️  Entradas problemáticas: ${analysis.problematic.length}`);
    console.log(`🔧 Entradas corregibles: ${analysis.correctable.length}`);

    if (analysis.phoneNumbers.length > 0) {
      console.log('\n📍 === NÚMEROS POR PAÍS ===');
      const countries = {};
      
      for (const phone of analysis.phoneNumbers) {
        if (!countries[phone.country]) {
          countries[phone.country] = { total: 0, problematic: 0 };
        }
        countries[phone.country].total++;
        if (phone.isProblematic) {
          countries[phone.country].problematic++;
        }
      }

      for (const [country, stats] of Object.entries(countries)) {
        console.log(`  ${country}: ${stats.total} números (${stats.problematic} problemáticos)`);
      }
    }

    if (analysis.correctable.length > 0) {
      console.log('\n🔧 === ENTRADAS CORREGIBLES ===');
      for (const correctable of analysis.correctable.slice(0, 10)) { // Mostrar solo las primeras 10
        console.log(`  ${correctable.lidKey} (${correctable.country})`);
        console.log(`    Actual: ${correctable.currentJid}`);
        console.log(`    Correcto: ${correctable.correctJid}`);
      }
      
      if (analysis.correctable.length > 10) {
        console.log(`  ... y ${analysis.correctable.length - 10} más`);
      }
    }
  }

  /**
   * Aplicar correcciones automáticas
   */
  applyCorrections(data, analysis) {
    if (analysis.correctable.length === 0) {
      return data;
    }
    
    const correctedData = { ...data };

    for (const correction of analysis.correctable) {
      const { lidKey, correctJid, phoneNumber, country } = correction;
      
      correctedData[lidKey] = {
        jid: correctJid,
        lid: `${lidKey}@lid`,
        name: phoneNumber,
        timestamp: Date.now(),
        corrected: true,
        country: country,
        phoneNumber: phoneNumber,
        originalEntry: correction.entry
      };
    }

    return correctedData;
  }

  /**
   * Ejecutar análisis completo
   */
  run(options = {}) {
    // Cargar datos
    const data = this.loadData();
    if (!data) return;

    // Crear respaldo si se va a aplicar correcciones
    if (options.fix) {
      this.createBackup(data);
    }

    // Analizar entradas
    const analysis = this.analyzeEntries(data);
    
    // Generar reporte solo si está en modo verbose
    this.generateReport(analysis, options.verbose);

    // Aplicar correcciones si se solicita
    if (options.fix) {
      const correctedData = this.applyCorrections(data, analysis);
      this.saveData(correctedData);
      
      // Solo mostrar resultado si no es modo silencioso
      if (options.verbose) {
        console.log(`\n✅ Se aplicaron ${analysis.correctable.length} correcciones`);
      }
    } else if (analysis.correctable.length > 0 && options.verbose) {
      console.log(`\n💡 Para aplicar las correcciones, ejecuta con el flag --fix:`);
      console.log(`   node analyze-phones.js --fix`);
    }

    return analysis;
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    fix: args.includes('--fix') || args.includes('-f'),
    silent: args.includes('--silent') || args.includes('-s')
  };

  if (!options.silent) {
    console.log('📱 === ANALIZADOR DE NÚMEROS TELEFÓNICOS ===');
  }

  const analyzer = new PhoneAnalyzer();
  analyzer.run(options);
}

export default PhoneAnalyzer;
