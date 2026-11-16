const test = require('node:test');
const assert = require('node:assert/strict');
const DSCard = require('../public/js/pago-tarjeta');

test('tarjeta: algoritmo de Luhn y detección de marca', () => {
  assert.equal(DSCard.luhn('4242 4242 4242 4242'), true);
  assert.equal(DSCard.luhn('4000 0000 0000 0002'), true);
  assert.equal(DSCard.luhn('3056 9309 0259 04'), true);
  assert.equal(DSCard.luhn('1234 5678 9012 3456'), false);
  assert.equal(DSCard.marca('4242 4242 4242 4242'), 'Visa');
  assert.equal(DSCard.marca('5555 5555 5555 4444'), 'Mastercard');
  assert.equal(DSCard.marca('3782 822463 10005'), 'Amex');
  assert.equal(DSCard.marca('3056 9309 0259 04'), 'Diners');
  assert.equal(DSCard.formatearNumero('4242424242424242'), '4242 4242 4242 4242');
  assert.equal(DSCard.formatearNumero('378282246310005'), '3782 822463 10005');
});

test('tarjeta: el vencimiento acepta MM/AA y MM/AAAA', () => {
  const futuro = DSCard.normalizarVencimiento('12/2030');
  assert.equal(futuro.mes, 12);
  assert.equal(futuro.anio, 2030);
  assert.equal(futuro.texto, '12/30');
  assert.equal(futuro.vencida, false);

  for (const valor of ['12/30', '1230', '122030']) {
    const v = DSCard.normalizarVencimiento(valor);
    assert.ok(v, `debería aceptar ${valor}`);
    assert.equal(v.texto, '12/30');
  }

  assert.equal(DSCard.normalizarVencimiento('13/30'), null);
  assert.equal(DSCard.normalizarVencimiento('12/2'), null);
  assert.equal(DSCard.normalizarVencimiento('1234567'), null);

  const anioPasado = new Date().getFullYear() - 1;
  const pasado = DSCard.normalizarVencimiento(`12/${String(anioPasado).slice(-2)}`);
  assert.equal(pasado.vencida, true);
});

test('tarjeta: validación de datos y tarjetas de prueba', () => {
  const base = {
    numero: '4242 4242 4242 4242',
    nombre: 'Carla Mendez',
    vence: '12/2030',
    cvv: '123'
  };

  const aprobada = DSCard.validar(base);
  assert.equal(aprobada.ok, true);
  assert.equal(aprobada.rechazo, false);
  assert.equal(aprobada.detalle, 'Visa •••• 4242');

  assert.equal(DSCard.validar({ ...base, numero: '**** **** **** 4242' }).campo, 'numero');
  assert.equal(DSCard.validar({ ...base, numero: '1234 5678 9012 3456' }).campo, 'numero');
  assert.equal(DSCard.validar({ ...base, nombre: 'Li' }).campo, 'nombre');
  assert.equal(DSCard.validar({ ...base, vence: '12/2' }).campo, 'vence');
  assert.equal(DSCard.validar({ ...base, vence: '12/25' }).campo, 'vence');
  assert.equal(DSCard.validar({ ...base, cvv: '12' }).campo, 'cvv');

  const diners = DSCard.validar({ ...base, numero: '3056 9309 0259 04' });
  assert.equal(diners.ok, true);
  assert.equal(diners.marca, 'Diners');

  const amex = DSCard.validar({ ...base, numero: '3782 822463 10005', cvv: '1234' });
  assert.equal(amex.ok, true);
  assert.equal(amex.marca, 'Amex');
  assert.equal(DSCard.validar({ ...base, numero: '3782 822463 10005', cvv: '123' }).campo, 'cvv');

  const rechazada = DSCard.validar({ ...base, numero: '4000 0000 0000 0002' });
  assert.equal(rechazada.ok, true);
  assert.equal(rechazada.rechazo, true);
});

test('tarjeta: la tarjeta de demostración siempre tiene una fecha futura', () => {
  const demo = DSCard.DEMO;
  assert.equal(DSCard.luhn(demo.numero), true);
  const vence = DSCard.normalizarVencimiento(demo.vence);
  assert.ok(vence);
  assert.equal(vence.vencida, false);
  assert.equal(
    DSCard.validar({ numero: demo.numero, nombre: demo.nombre, vence: demo.vence, cvv: demo.cvv }).ok,
    true
  );
});

test('tarjeta: todas las tarjetas de prueba son válidas y la de rechazo está marcada', () => {
  assert.ok(DSCard.TARJETAS_PRUEBA.length >= 4);
  for (const tarjeta of DSCard.TARJETAS_PRUEBA) {
    assert.equal(DSCard.luhn(tarjeta.numero), true, `${tarjeta.numero} debe pasar Luhn`);
  }
  assert.ok(DSCard.TARJETAS_PRUEBA.some(t => t.resultado === 'rechazada'));
});
