/*=====================================================================*/
/*    serrano/prgm/utils/hopsmtp/cdb.js                                */
/*    -------------------------------------------------------------    */
/*    Author      :  Manuel Serrano                                    */
/*    Creation    :  Wed Jan  6 15:20:35 2021                          */
/*    Last change :  Tue Jan 28 08:47:25 2025 (serrano)                */
/*    Copyright   :  2021-25 Manuel Serrano                            */
/*    -------------------------------------------------------------    */
/*    Contact database (for encryption and for smtp server selection)  */
/*=====================================================================*/
import fs from 'fs';
import path from 'path';
import { load } from '@hop/vcf';

/*---------------------------------------------------------------------*/
/*    loadCDB ...                                                      */
/*---------------------------------------------------------------------*/
export function loadCDB(files) {
   for (let i = 0; i < files.length; i++) {
      const f = files[ i ];
      
      if (fs.existsSync(f)) {
	 try {
	    return load(f);
	 } catch (e) {
	    console.error("hopsmtp: cannot load cdb \"" + f + "\"");
	    console.error(e.toString());
	 }
      } else {
	 const m = f.match(/([$]HOME)[/](.*)/);

	 if (m) {
	    const g = path.join(process.env.HOME, m[ 2 ]);
	    
	    if (fs.existsSync(g)) {
	       try {
	       	  return load(g);
	       } catch (e) {
	    	  console.error("hopsmtp: cannot load cdb \"" + g + "\"");
		  #:exception-notify(e);
	    	  console.error(e.toString());
	       }
	    }
	 }
      }
   }
   return {};
}

/*---------------------------------------------------------------------*/
/*    findCDB ...                                                      */
/*---------------------------------------------------------------------*/
export function findCDB(cdb, email) {
   return cdb.find(contact => 
		contact.emails.some(e => e.email.indexOf(email) >= 0));
}
