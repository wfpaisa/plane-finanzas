/**
 * Las categorías con las que arranca cada usuario nuevo.
 *
 * Van sin color: al crearlas, el gancho de `main.pb.js` le da a cada una un
 * tinte que no tenga otra de su tipo (`lib/tints.js`).
 */
module.exports = {
  categories: [
    { name: "Mercado", kind: "expense", tags: ["variable"], icon: "shopping-cart-01" },
    { name: "Restaurantes", kind: "expense", tags: ["variable"], icon: "restaurant-01" },
    { name: "Transporte", kind: "expense", tags: ["variable"], icon: "car-01" },
    { name: "Vivienda", kind: "expense", tags: ["fijo"], icon: "home-01" },
    { name: "Servicios públicos", kind: "expense", tags: ["fijo"], icon: "flash" },
    { name: "Salud", kind: "expense", tags: ["variable"], icon: "medicine-02" },
    { name: "Suscripciones", kind: "expense", tags: ["fijo"], icon: "play-list" },
    { name: "Compras", kind: "expense", tags: ["variable"], icon: "shopping-bag-01" },
    { name: "Impuestos", kind: "expense", tags: ["fijo"], icon: "court-house" },
    { name: "Seguros", kind: "expense", tags: ["fijo"], icon: "shield-01" },
    { name: "Familia", kind: "expense", tags: ["fijo"], icon: "user-group" },
    { name: "Educación", kind: "expense", tags: ["fijo"], icon: "book-open-01" },
    { name: "Entretenimiento", kind: "expense", tags: ["variable"], icon: "game-controller-03" },
    { name: "Viajes", kind: "expense", tags: ["variable"], icon: "airplane-01" },
    { name: "Retiros", kind: "expense", tags: ["variable"], icon: "atm-01" },
    { name: "Otros gastos", kind: "expense", tags: ["variable"], icon: "more-horizontal" },
    { name: "Salario", kind: "income", icon: "money-bag-02" },
    { name: "Inversiones", kind: "income", icon: "analytics-up" },
    { name: "Ventas", kind: "income", icon: "store-01" },
    { name: "Transferencias recibidas", kind: "income", icon: "money-receive-01" },
    { name: "Otros ingresos", kind: "income", icon: "money-add-01" },
  ],
};
