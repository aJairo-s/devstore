/**
 * Utilidades de tarjeta para el checkout de demostración.
 *
 * No se envía ni se almacena ningún dato de tarjeta: esta lógica solo
 * valida y formatea en el navegador. El servidor únicamente recibe una
 * etiqueta segura como «Visa •••• 4242».
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DSCard = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN_DIGITOS = 14;
  const MAX_DIGITOS = 19;

  function limpiarNumero(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function luhn(numero) {
    const digitos = limpiarNumero(numero);
    if (!digitos) return false;
    let suma = 0;
    let doble = false;
    for (let i = digitos.length - 1; i >= 0; i--) {
      let d = Number(digitos[i]);
      if (doble) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      suma += d;
      doble = !doble;
    }
    return suma % 10 === 0;
  }

  function marca(numero) {
    const n = limpiarNumero(numero);
    if (/^4/.test(n)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
    if (/^3[47]/.test(n)) return 'Amex';
    if (/^3(0[0-5]|[68])/.test(n)) return 'Diners';
    if (/^35/.test(n)) return 'JCB';
    if (/^(6011|64[4-9]|65)/.test(n)) return 'Discover';
    return 'Tarjeta';
  }

  function formatearNumero(valor) {
    const d = limpiarNumero(valor).slice(0, MAX_DIGITOS);
    if (!d) return '';
    if (marca(d) === 'Amex') {
      return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
    }
    return d.replace(/(.{4})/g, '$1 ').trim();
  }

  /**
   * Acepta 12/30, 12/2030, 1230 o 122030.
   * Devuelve null si el formato no es válido.
   */
  function normalizarVencimiento(valor) {
    const d = String(valor || '').replace(/\D/g, '');
    if (d.length !== 4 && d.length !== 6) return null;
    const mes = Number(d.slice(0, 2));
    const anio = Number(d.length === 4 ? '20' + d.slice(2) : d.slice(2));
    if (mes < 1 || mes > 12) return null;
    if (anio < 2000 || anio > 2100) return null;
    // Una tarjeta es válida hasta el último día de su mes de vencimiento.
    const finDeVigencia = new Date(anio, mes, 1);
    return {
      mes,
      anio,
      texto: `${String(mes).padStart(2, '0')}/${String(anio).slice(-2)}`,
      vencida: finDeVigencia <= new Date()
    };
  }

  function vencimientoDemo() {
    return `12/${new Date().getFullYear() + 4}`;
  }

  const DEMO = {
    numero: '4242 4242 4242 4242',
    nombre: 'CARLA MENDEZ',
    cvv: '123',
    get vence() { return vencimientoDemo(); }
  };

  const TARJETAS_PRUEBA = [
    { numero: '4242 4242 4242 4242', marca: 'Visa', resultado: 'aprobada', cvv: 3 },
    { numero: '5555 5555 5555 4444', marca: 'Mastercard', resultado: 'aprobada', cvv: 3 },
    { numero: '3782 822463 10005', marca: 'Amex', resultado: 'aprobada', cvv: 4 },
    { numero: '3056 9309 0259 04', marca: 'Diners', resultado: 'aprobada', cvv: 3 },
    { numero: '4000 0000 0000 0002', marca: 'Visa', resultado: 'rechazada', cvv: 3 }
  ];

  function validar(datos) {
    const numero = limpiarNumero(datos && datos.numero);
    if (numero.length < MIN_DIGITOS || numero.length > MAX_DIGITOS || !luhn(numero))
      return { ok: false, campo: 'numero', error: 'Revisa el número de la tarjeta (14 a 19 dígitos)' };

    const nombre = String((datos && datos.nombre) || '').trim();
    if (nombre.length < 3)
      return { ok: false, campo: 'nombre', error: 'Escribe el nombre que aparece en la tarjeta' };

    const vence = normalizarVencimiento(datos && datos.vence);
    if (!vence)
      return { ok: false, campo: 'vence', error: 'Usa un vencimiento MM/AA o MM/AAAA' };
    if (vence.vencida)
      return { ok: false, campo: 'vence', error: 'La tarjeta está vencida' };

    const marcaTarjeta = marca(numero);
    const cvv = String((datos && datos.cvv) || '');
    const cvvValido = marcaTarjeta === 'Amex' ? /^\d{4}$/.test(cvv) : /^\d{3,4}$/.test(cvv);
    if (!cvvValido)
      return {
        ok: false,
        campo: 'cvv',
        error: marcaTarjeta === 'Amex' ? 'El CVV de Amex tiene 4 dígitos' : 'El CVV debe tener 3 o 4 dígitos'
      };

    return {
      ok: true,
      rechazo: numero === '4000000000000002',
      marca: marcaTarjeta,
      vencimiento: vence.texto,
      detalle: `${marcaTarjeta} •••• ${numero.slice(-4)}`
    };
  }

  return {
    MIN_DIGITOS, MAX_DIGITOS,
    limpiarNumero, luhn, marca, formatearNumero,
    normalizarVencimiento, validar, vencimientoDemo,
    DEMO, TARJETAS_PRUEBA
  };
});
