# EcoMovil Web

Front web de EcoMovil (VerdeRuta, 1ASI0657). Consume el API Gateway del backend de microservicios.

- Sitio estático: `index.html`, `app.js`, `styles.css`, `config.js`. No requiere build.
- La URL del API se define en `config.js` (por defecto `http://localhost:8080`) y se puede cambiar desde la pantalla de login.
- Requiere CORS habilitado en el API Gateway (`spring.cloud.gateway.server.webflux.globalcors`).

## Ejecutar en local

```bash
python -m http.server 8795
```

Luego abrir http://localhost:8795 con el API Gateway corriendo en el puerto 8080.
