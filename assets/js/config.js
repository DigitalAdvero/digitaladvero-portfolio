/* =========================================================================
   DIGITALADVERO — KONTAKT I DRUŠTVENE MREŽE
   -------------------------------------------------------------------------
   Ovo je JEDINA datoteka koju trebate urediti da biste dodali svoje
   kontakt podatke. Upišite vrijednosti između navodnika.
   Polja koja ostavite prazna ("") neće se prikazati na stranici.

   Primjeri u komentarima su izmišljeni i služe samo kao uzorak formata.
   ========================================================================= */
window.DIGITALADVERO_CONFIG = {
  /* E-mail adresa za upite, npr. "info@vasadomena.ba" */
  email: "",

  /* Telefon onako kako želite da se prikazuje, npr. "+387 6X XXX XXX" */
  phone: "",

  /* WhatsApp broj u međunarodnom formatu, samo cifre, npr. "3876XXXXXXX" */
  whatsapp: "",

  /* Viber broj u međunarodnom formatu, samo cifre, npr. "3876XXXXXXX" */
  viber: "",

  /* Grad / adresa, npr. "Sarajevo, Bosna i Hercegovina" */
  location: "",

  /* Radno vrijeme, npr. "Pon – Pet, 09:00 – 17:00" */
  workingHours: "",

  /* Link na vašu postojeću web stranicu, npr. "https://www.vasadomena.ba" */
  website: "",

  /* Društvene mreže — puni linkovi, npr. "https://www.instagram.com/vas.profil" */
  social: {
    instagram: "",
    facebook: "",
    linkedin: "",
    tiktok: "",
    youtube: "",
    behance: ""
  },

  /* Kontakt forma:
     - Ako upišete "endpoint" (npr. Formspree: "https://formspree.io/f/xxxxxxx"),
       poruke iz forme se šalju direktno na vaš e-mail preko tog servisa.
     - Ako je "endpoint" prazan, forma otvara e-mail program posjetioca s
       popunjenom porukom na adresu iz polja "email" (ili WhatsApp, ako nema e-maila). */
  form: {
    endpoint: ""
  }
};
