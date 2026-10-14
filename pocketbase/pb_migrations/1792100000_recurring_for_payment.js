/// <reference path="../pb_data/types.d.ts" />

// Una transferencia programada que reserva dinero para un pago (por ejemplo,
// a una cuenta donde se junta el predial): cuenta en los pagos programados y
// sale de lo disponible para gastar.
migrate(
  (app) => {
    const recurring = app.findCollectionByNameOrId("recurring");
    recurring.fields.add(new BoolField({ name: "for_payment" }));
    app.save(recurring);
  },
  (app) => {
    const recurring = app.findCollectionByNameOrId("recurring");
    recurring.fields.removeByName("for_payment");
    app.save(recurring);
  },
);
