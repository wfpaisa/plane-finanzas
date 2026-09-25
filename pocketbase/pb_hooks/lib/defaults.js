/**
 * Las categorías con las que arranca cada usuario nuevo.
 *
 * Las palabras clave son las que usa la importación desde Gmail para
 * categorizar sola: se comparan sin tildes ni mayúsculas contra el comercio
 * y la descripción. Cada quien las edita después en Ajustes.
 *
 * Van sin color: al crearlas, el gancho de `main.pb.js` le da a cada una un
 * tinte que no tenga otra de su tipo (`lib/tints.js`).
 */
module.exports = {
  categories: [
    { name: "Mercado", kind: "expense", tags: ["variable"], icon: "shopping-cart-01", keywords: "exito, carulla, d1, tiendas ara, jumbo, olimpica, makro, pricesmart, euro supermercados, surtimax, mercado, fruver, justo y bueno, isimo" },
    { name: "Restaurantes", kind: "expense", tags: ["variable"], icon: "restaurant-01", keywords: "rappi, restaurante, ifood, frisby, kfc, mcdonalds, el corral, juan valdez, starbucks, cafe, pizza, burger, crepes, domicilio" },
    { name: "Transporte", kind: "expense", tags: ["variable"], icon: "car-01", keywords: "uber, didi, cabify, indriver, terpel, primax, texaco, biomax, esso, mobil, gasolina, parqueadero, peaje, metro de medellin, civica, taxi" },
    { name: "Vivienda", kind: "expense", tags: ["fijo"], icon: "home-01", keywords: "hipotecario, credito hipotecario, arriendo, administracion, conjunto" },
    { name: "Servicios públicos", kind: "expense", tags: ["fijo"], icon: "flash", keywords: "epm, empresas publicas, claro, movistar, tigo, une, etb, gas natural, acueducto, energia, internet, celular" },
    { name: "Salud", kind: "expense", tags: ["variable"], icon: "medicine-02", keywords: "farmacia, drogueria, cruz verde, farmatodo, colsubsidio, eps, clinica, medico, odontolog, laboratorio, optica" },
    { name: "Suscripciones", kind: "expense", tags: ["fijo"], icon: "play-list", keywords: "netflix, spotify, disney, hbo, prime video, amazon prime, youtube, apple.com, icloud, google one, chatgpt, openai, anthropic" },
    { name: "Compras", kind: "expense", tags: ["variable"], icon: "shopping-bag-01", keywords: "amazon, mercadolibre, mercado libre, falabella, zara, adidas, nike, homecenter, alkosto, ktronix, temu, shein, tienda" },
    { name: "Impuestos", kind: "expense", tags: ["fijo"], icon: "court-house", keywords: "dian, predial, impuesto, renta, vehiculo, 4x1000, gmf" },
    { name: "Seguros", kind: "expense", tags: ["fijo"], icon: "shield-01", keywords: "seguro, funerari, allianz, seguros bolivar, suramericana, axa colpatria, mapfre, soat" },
    { name: "Familia", kind: "expense", tags: ["fijo"], icon: "user-group", keywords: "mama, papa, familia" },
    { name: "Educación", kind: "expense", tags: ["fijo"], icon: "book-open-01", keywords: "universidad, colegio, curso, udemy, platzi, coursera, libreria" },
    { name: "Entretenimiento", kind: "expense", tags: ["variable"], icon: "game-controller-03", keywords: "cine, cinecolombia, procinal, cinemark, steam, playstation, xbox, nintendo, tuboleta, concierto, bar" },
    { name: "Viajes", kind: "expense", tags: ["variable"], icon: "airplane-01", keywords: "avianca, latam, wingo, jetsmart, booking, airbnb, hotel, despegar, expedia" },
    { name: "Retiros", kind: "expense", tags: ["variable"], icon: "atm-01", keywords: "cajero, retiro" },
    { name: "Otros gastos", kind: "expense", tags: ["variable"], icon: "more-horizontal", keywords: "" },
    { name: "Salario", kind: "income", icon: "money-bag-02", keywords: "nomina, salario, sueldo, prima" },
    { name: "Inversiones", kind: "income", icon: "analytics-up", keywords: "rendimientos, intereses, dividendos, cdt" },
    { name: "Ventas", kind: "income", icon: "store-01", keywords: "venta, datafono, pago recibido" },
    { name: "Transferencias recibidas", kind: "income", icon: "money-receive-01", keywords: "transferencia, recibiste" },
    { name: "Otros ingresos", kind: "income", icon: "money-add-01", keywords: "" },
  ],
};
