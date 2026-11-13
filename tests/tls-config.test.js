const { shouldUseLocalHttps, loadTlsOptions } = require('../config/tls');

describe('Local TLS server configuration', () => {
  test('enables a local HTTPS listener only for production simulation', () => {
    expect(shouldUseLocalHttps({
      isTestEnvironment: false,
      isProduction: true,
      tlsMode: 'local'
    })).toBe(true);

    expect(shouldUseLocalHttps({
      isTestEnvironment: false,
      isProduction: true,
      tlsMode: 'proxy'
    })).toBe(false);
    expect(shouldUseLocalHttps({
      isTestEnvironment: false,
      isProduction: false,
      tlsMode: 'local'
    })).toBe(false);
    expect(shouldUseLocalHttps({
      isTestEnvironment: true,
      isProduction: true,
      tlsMode: 'local'
    })).toBe(false);
  });

  test('fails clearly when local TLS files are missing', () => {
    expect(() => loadTlsOptions({
      certPath: '/definitely-missing/localhost.pem',
      keyPath: '/definitely-missing/localhost-key.pem'
    })).toThrow(/requires readable TLS files.*Generate them with mkcert/);
  });

  test('does not accept invalid TLS certificate material', () => {
    expect(() => loadTlsOptions({
      certPath: __filename,
      keyPath: __filename
    })).toThrow('could not load the TLS certificate and private key');
  });
});
