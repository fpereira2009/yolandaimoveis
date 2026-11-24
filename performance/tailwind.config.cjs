/** Etapa opcional, SOMENTE após validação visual do CSS compilado. */
module.exports = {
  content: ['./public/**/*.{html,js}', './functions/**/*.js'],
  theme: {
    extend: {
      colors: {
        sand: {DEFAULT:'#F5F2EB',warm:'#FCFBF8',border:'#E5DFD3'},
        moss: {DEFAULT:'#2C4A3E',light:'#3B6152',dark:'#1E352C',soft:'#EAF0ED'},
        terracotta: {DEFAULT:'#C86D51',hover:'#B55C41',soft:'#F8EBE7'},
        charcoal:'#232825',whatsapp:'#25D366'
      },
      fontFamily:{heading:['Plus Jakarta Sans','sans-serif'],sans:['Inter','sans-serif']},
      boxShadow:{soft:'0 10px 30px -10px rgba(44,74,62,.08)',card:'0 4px 20px -2px rgba(44,74,62,.07)',float:'0 12px 28px rgba(37,211,102,.34)'}
    }
  }
};
