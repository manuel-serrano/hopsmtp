/*=====================================================================*/
/*    serrano/prgm/utils/hopsmtp/hopsmtp.js                            */
/*    -------------------------------------------------------------    */
/*    Author      :  Manuel Serrano                                    */
/*    Creation    :  Sat Oct  1 13:09:48 2016                          */
/*    Last change :  Thu Apr  1 19:30:38 2021 (serrano)                */
/*    Copyright   :  2016-21 Manuel Serrano                            */
/*    -------------------------------------------------------------    */
/*    hopsmtp.js                                                       */
/*=====================================================================*/
"use hopscript";

/*---------------------------------------------------------------------*/
/*    import                                                           */
/*---------------------------------------------------------------------*/
const SMTPConnection = require( 'smtp-connection' );
const fs = require( 'fs' );
const path = require( 'path' );
const os = require( 'os' );
const iconv = require( "iconv-lite" );
let syslog = require( hop.syslog );

import { loadCDB, findCDB } from "./cdb.js";
import { system, systemSync } from hop.system;

/*---------------------------------------------------------------------*/
/*    constant                                                         */
/*---------------------------------------------------------------------*/
const RCbase = "hopsmtp";
const XSMTPmethodrx = /^[ \t]*X-Message-SMTP-Method:[ \t]*([^\r\n]+)/mi;

/*---------------------------------------------------------------------*/
/*    Global variables                                                 */
/*---------------------------------------------------------------------*/
var config;
var args;
var dbg = false;
var cdb = [];

/*---------------------------------------------------------------------*/
/*    debug ...                                                        */
/*---------------------------------------------------------------------*/
function debug( ... args ) {
   
   function toString( a ) {
      if( a instanceof Object ) {
	 return JSON.stringify( a );
      } else {
	 return a.toString();
      }
   }
   
   if( dbg ) {
      fs.writeSync( dbg.fd, "[" );
      fs.writeSync( dbg.fd, dbg.date );
      fs.writeSync( dbg.fd, "] " );
      args.forEach( a => fs.writeSync( dbg.fd, toString( a ) ) );
      fs.writeSync( dbg.fd, "\n" );
   }
}

/*---------------------------------------------------------------------*/
/*    exit ...                                                         */
/*---------------------------------------------------------------------*/
function exit( status ) {
   if( dbg ) {
      fs.closeSync( dbg.fd );
   }
   process.exit( status );
}

/*---------------------------------------------------------------------*/
/*    fail ...                                                         */
/*---------------------------------------------------------------------*/
function fail( msg, status ) {
   console.log( msg );
   debug( msg );
   exit( status );
}

/*---------------------------------------------------------------------*/
/*    findConfigFile ...                                               */
/*---------------------------------------------------------------------*/
function findConfigFile( file ) {
   const home = process.env.HOME;
   const host = os.hostname();
   const configdir = path.join( home, ".config", "hop", "hopsmtp" );
   const base = file.split( "." );
   const name = base[ 0 ];
   const suf = "." + base[ 1 ];
   
   let i = host.lastIndexOf( "." );

   while( i > 0 ) {
      let rc = path.join( configdir, name + "." + host.substring( 0, i ) + suf );
      if( fs.existsSync( rc ) ) {
	 return require( rc );
      } else {
	 i = host.lastIndexOf( ".", i - 1 );
      }
   }

   let rc = path.join( configdir, file );
   
   if( fs.existsSync( rc ) ) {
      return rc;
   } else {
      return false;
   }
}
   
/*---------------------------------------------------------------------*/
/*    loadConfig ...                                                   */
/*---------------------------------------------------------------------*/
function loadConfig( args ) {
   if( "config" in args ) {
      if( fs.existsSync( args.config ) ) {
	 config = require( args.config );
      } else {
	 throw "Config file does not exist \"" + args.config + "\"";
      }
   } else {
      let cfg = findConfigFile( "hopsmtp.json" );
   
      if( cfg ) {
	 config = require( cfg );
      } else {
	 throw "Cannot find \"hopsmtp.json\""; 
      }
   }

   if( !("queue" in config) ) {
      config.queue = path.join( process.env.HOME, ".config", "hop", "hopsmtp", "queue"  );
   }

   if( !("immediateDelivery" in config) ) {
      config.immediateDelivery = [];
   } else {
      config.immediateDelivery =
	 config.immediateDelivery.map( (o, _i, _arr) => o.toLowerCase() );
   }

   return config;
}

/*---------------------------------------------------------------------*/
/*    loadRC ...                                                       */
/*---------------------------------------------------------------------*/
function loadRC() {
   let rc = findConfigFile( "hopsmptrc.js" );

   return (rc ? require( rc ) : {});
}
   
/*---------------------------------------------------------------------*/
/*    loadState ...                                                    */
/*---------------------------------------------------------------------*/
function loadState() {
   let st = findConfigFile( "state.json" );

   return (st ? require( st ) : {});
}

/*---------------------------------------------------------------------*/
/*    findSMTPServers ...                                              */
/*    -------------------------------------------------------------    */
/*    This function is used when a message explictly mentions          */
/*    an STMP server on its header.                                    */
/*---------------------------------------------------------------------*/
function findSMTPServers( config, message ) {
   const smtp = message.smtp.match( /([^ ]+)[ \t]+([^ ]+)[ \t]+([0-9]+)?/ );

   if( smtp ) {
      const port = smtp[ 3 ] ? parseInt( smtp[ 3 ] ) : -1;
      
      return config.servers.filter( 
	 s => (!s.method || (s.method === stmp[ 1 ]))
	    && s.host === smtp[ 2 ]
	    && (port === -1 || port === s.port) );
   }
}

/*---------------------------------------------------------------------*/
/*    findMessageServers ...                                           */
/*    -------------------------------------------------------------    */
/*    Select amongst all the possible servers that are elligible       */
/*    for that message, i.e., those that are elligible for that        */
/*    message "from" or "reply-to" fields.                             */
/*---------------------------------------------------------------------*/
function findMessageServers( config, message ) {
   
   function regexi( str ) {
      return new RegExp( str, "i" );
   }
   
   if( message.smtp ) {
      return findSMTPServers( config, message );
   } else {
      const replyto = message.replyto || message.from;
      
      if( !replyto ) {
      	 // no from!, all servers matches
      	 return config.servers;
      } 
      
      // first traversal, servers that match replyto
      const positive = config.servers.filter( 
      	 s => s[ "reply-to" ] && replyto.match( regexi( s[ "reply-to" ] ) ) );
      
      if( positive.length >= 1 ) { 
      	 return positive;
      }
      
      // second traversla, generics and those that match
      return config.servers.filter( 
      	 s => !s[ "reply-to" ] || replyto.match( regexi( s[ "reply-to" ] ) ) );
   }
}

/*---------------------------------------------------------------------*/
/*    setQueuing ...                                                   */
/*---------------------------------------------------------------------*/
function setQueuing( val ) {
   const home = process.env.HOME;
   const st = path.join( home, ".config", "hop", "hopsmtp", "state.json" );
   var fd = fs.openSync( st, "w" );
   fs.writeSync( fd, '{ "outOfMail": ' + val + ' }' );
   fs.closeSync( fd );
}

/*---------------------------------------------------------------------*/
/*    showQueue ...                                                    */
/*---------------------------------------------------------------------*/
async function showQueue( config ) {
   console.log( config.queue + ":" );

   if( fs.existsSync( config.queue ) && fs.statSync( config.queue ).isDirectory() ) {
      return Promise.all( fs.readdirSync( config.queue ).map( file => {
	 let qf = path.join( config.queue, file );
	 return readMessage( fs.createReadStream( qf ) )
	    .then( msg => {
	       const subject = msg.head.match( /^[ \t]*Subject:[ \t]*([^\r\n]+)/mi );
	       console.log( "  ", file, "[" + fs.statSync( qf ).ctime + "]" );
	       console.log( "     to:", msg.to.join( ", " ) );
	       if( subject ) console.log( "     subject:", subject[ 1 ] );
	    } );
      } ) );
   } else {
      return new Promise( function( resolve, reject ) {
	 reject( config.queue );
      } );
   }
}
   
/*---------------------------------------------------------------------*/
/*    readMessage ...                                                  */
/*---------------------------------------------------------------------*/
function readMessage( stream ) {
   
   function normalizeEmail( str ) {
      const m = str.match( /[^<> \t\r]+@[^<> \t\r]+/ );
      return m ? m[ 0 ] : str;
   }

   function normalizeEmails( str ) {
      const es = str.replace( /[\r\n]/mg, " " )
	    .replace( /\"[^\"]*\"[ ]*/, "" )
	    .replace( "\\,", " " );
      return es.split( "," ).map( normalizeEmail );
   }

   return new Promise( function( resolve, reject ) {
      var msg = "";
      
      debug( "read message...in promise" );
      stream.on( 'data', data => {
	 msg += iconv.decode( data, "latin1" );
      } );

      stream.on( 'end', () => {
	 try {
	    const sep = msg.match( /(?:\r?\n){2}/ );

	    if( sep ) {
	       const hd = msg.substring( msg, sep.index );
	       const hdto = hd.match( /^[ \t]*To:[ \t]*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/mi );
	       const hdcc = hd.match( /^[ \t]*cc:[ \t]*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/mi );
	       const hdbcc = hd.match( /^[ \t]*bcc:[ \t]*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/mi );
	       const hdfrom = hd.match( /^[ \t]*From:[ \t]*([^\r\n]+)/mi );
	       const hdreplyto = hd.match( /^[ \t]*Reply-to:[ \t]*([^\r\n]+)/mi );
	       const hdsmtp = hd.match( XSMTPmethodrx );

	       if( hdto ) {
	       	  const target = normalizeEmails( hdto[ 1 ] );
	       	  let to = target;

	       	  if( hdcc ) {
		     to = to.concat( normalizeEmails( hdcc[ 1 ] ) );
	       	  }

	       	  if( hdbcc ) {
		     to = to.concat( normalizeEmails( hdbcc[ 1 ] ) );
	       	  }

	       	  resolve( { to: to,
			     target: target,
			     from: normalizeEmail( hdfrom ? hdfrom[ 1 ] : (args.f || "") ),
			     replyto: hdreplyto && normalizeEmail( hdreplyto[ 1 ] ),
                             smtp: hdsmtp && hdsmtp[ 1 ],
			     head: hd,
			     msg: msg } );
	    } else {
	       reject( "Cannot find destination address" );
	    }
	 } else {
	    reject( "Cannot find header" );
	 }
      	 } catch( e ) { #:exception-notify( e ); throw( e ); } }  );
   } );
}

/*---------------------------------------------------------------------*/
/*    login ...                                                        */
/*---------------------------------------------------------------------*/
function login( server ) {
   if( !("login" in server) ) {
      return Promise.resolve( undefined );
   } else {
      const lg = server.login;
      
      if( "pass" in lg ) {
      	 return Promise.resolve( lg );
      } else if( "command" in lg ) {
	 const key = lg.command
		  .replace( /%h/g, server.host )
	          .replace( /%p/g, server.port )
	          .replace( /%u/g, lg.user );
	    
      	 return system( key )
	    .then( passwd => {
	       	      lg.pass = passwd.trim();
	       	      return lg;
	    	   } );
      } else {
      	 return Promise.reject( "Unknown login method" );
      }
   }
}

/*---------------------------------------------------------------------*/
/*    openMessageConnection ...                                        */
/*---------------------------------------------------------------------*/
function openMessageConnection( msg, servers ) {

   function open( server ) {
      syslog.log( syslog.LOG_INFO, 
	 "Creating "
	 + ((server.secure || server.requireTLS) ? "SSL" : "")
	 + " connection to " + server.host + ":" + server.port);
      debug( "connecting to " + server.host + ":" + server.port + "..." );

      return new Promise( function( resolve, reject ) {
      	 const conn = new SMTPConnection( server );
      	 conn.on( 'error', reject );
	 login( server )
	    .then( login => 
	       conn.connect( () => conn.login( login, (a = undefined, b = undefined) => resolve( conn ) ) ) )
	    .catch( err => {
		   debug( "cannot authenticate" );
		   syslog.log( syslog.LOG_ERROR, `Cannot authenticate to ${server.host}:${server.port} -- ${err.toString()}` );
		   reject( "cannot authenticate" );
		} )
      } );
   }
   
   function loop( resolve, reject, i ) {
      debug( "in loop i=", i, " len=", servers.length );
      if( i >= servers.length ) {
	 reject( "no server available!" );
      } else {
	 const server = servers[ i ];
	 debug( "trying server: ", 
	    servers[ i ].host + ":" + servers[ i ].port );
	 return open( server )
	    .then( conn => { 
	       debug( "connection succeeded: ", server );
	       conn.config = server; 
	       conn.sendMessage = sendStmpMessage;
	       resolve( conn ) 
	    },
	       err => {
   		  debug( "connection failed: ", server + " " + err.toString() );
		  syslog.log( syslog.LOG_ERROR, "Cannot connect: " + err.toString() );
   		  loop( resolve, reject, i + 1 );
	       } )
      }
   }
   
   return new Promise( (resolve, reject) => loop( resolve, reject, 0 ) );
}

/*---------------------------------------------------------------------*/
/*    sendStmpMessage ...                                              */
/*---------------------------------------------------------------------*/
function sendStmpMessage( config, message ) {
   const conn = this;
   
   return new Promise( function( resolve, reject ) {
      function logSent( conn, info  ) {
	 syslog.log( syslog.LOG_INFO, "Sent mail for " + message.from
+ " (" + conn.host + ":" + conn.port + ")"
+ " uid=" + process.getuid()
+ " username=" + (process.env.USERNAME || process.env.LOGNAME)
+ " outbytes=" + message.msg.length );
      }

      function logError( conn, err ) {
	 syslog.log( syslog.LOG_ERROR, "Cannot sent mail for " + message.from
+ " (" + conn.host + ":" + conn.port + ")"
+ " uid=" + process.getuid()
+ " username=" + (process.env.USERNAME || process.env.LOGNAME)
+ " outbytes=" + message.msg.length
+ err.toString() );
      }

      debug( `sending mail to ${message.to} via ${conn.host}:${conn.port}` );

      const contact = findCDB( cdb, message.to );

      const buf = iconv.encode( message.msg, "latin1" );
      debug( "encoded ", message.msg.length, " characters" );
      
      message.use8BitMime = true;
      
      conn.send( message, buf, (err, info) => {
	 debug( "sent " + (err ? info : "ok") );
	 conn.quit();
	 if( err === null ) {
	    logSent( conn, info );
	    resolve( info );
	 } else {
	    logError( conn, err );
	    reject( err );
	 }
      } );
   } );
}

/*---------------------------------------------------------------------*/
/*    flushMessageQueue ...                                            */
/*---------------------------------------------------------------------*/
function flushMessageQueue( config ) {
   return new Promise( function( resolve, reject ) {
      if( fs.existsSync( config.queue ) && fs.statSync( config.queue ).isDirectory() ) {
	 var iterator = (function *generator() {
	    yield * fs.readdirSync( config.queue );
	 })();

	 function sendNextInQueueFile() {
	    var file = iterator.next();

	    if( !file.done ) {
	       debug( "flushing message ", file.value );

	       let p = path.join( config.queue, file.value );
	       let s = fs.createReadStream( p );
	       readMessage( s )
		  .then( o => sendOrQueue( config, o, true ) )
		  .then( o => fs.unlinkSync( p ) )
		  .then( sendNextInQueueFile )
		  .catch( sendNextInQueueFile )
	          .then( o => s.close(), o => s.close() )
	    } else {
	       resolve( undefined );
	    }
	 }

	 sendNextInQueueFile();
      } else {
	 resolve( undefined );
      }
   } );
}

/*---------------------------------------------------------------------*/
/*    sendMidMessageQueue ...                                          */
/*---------------------------------------------------------------------*/
function sendMidMessageQueue( config, mid ) {
   const files = fs.readdirSync( config.queue );
   const i = files.indexOf( mid );

   if( i ) {
      let p = path.join( config.queue, files[ i ] );
      let s = fs.createReadStream( p );
      return readMessage( s )
	 .then( o => sendOrQueue( config, o, true ) )
	 .then( o => fs.unlinkSync( p ) )
	 .then( o => s.close(), o => s.close() )
   } else {
      return new Promise( function( resolve, reject ) {
	 reject( "Not such message \"" + mid + "\"" );
      } )
   }
}

/*---------------------------------------------------------------------*/
/*    sendRecipientMessageQueue ...                                    */
/*---------------------------------------------------------------------*/
function sendRecipientMessageQueue( config, conn, recipient ) {
   return new Promise( function( resolve, reject ) {
      if( fs.existsSync( config.queue ) && fs.statSync( config.queue ).isDirectory() ) {
	 var iterator = (function *generator() {
	    yield * fs.readdirSync( config.queue );
	 })();

	 function sendNextInQueueFile() {
	    var file = iterator.next();

	    if( !file.done ) {
	       debug( "flushing message ", file.value );

	       let p = path.join( config.queue, file.value );
	       let s = fs.createReadStream( p );
	       readMessage( s )
		  .then( o => {
		     if( o.to.indexOf( recipient ) ) {
			return sendOrQueue( config, o, true )
			   .then( o => fs.unlinkSync( p ) );
		     } else {
			return o;
		     }
		  } )
		  .then( sendNextInQueueFile )
		  .catch( sendNextInQueueFile )
		  .then( o => s.close(), o => s.close() )
	    } else {
	       resolve( undefined );
	    }
	 }

	 sendNextInQueueFile();
      } else {
	 resolve( undefined );
      }
   } );
}

/*---------------------------------------------------------------------*/
/*    makeDirectories ...                                              */
/*---------------------------------------------------------------------*/
function makeDirectories( dir ) {
   if( fs.existsSync( dir ) ) {
      if( !fs.statSync( dir ).isDirectory() ) {
	 throw "Not a directory \"" + parent + "\"";
      }
      return;
   }
   var parent = path.dirname( dir );

   if( !fs.existsSync( parent ) ) makeDirectories( parent );
   if( !fs.statSync( parent ).isDirectory() ) {
      throw "Not a directory \"" + parent + "\"";
   }
   fs.mkdirSync( dir );
}

/*---------------------------------------------------------------------*/
/*    messageQueue ...                                                 */
/*---------------------------------------------------------------------*/
function messageQueue( config, message ) {

   function newName( path ) {
      if( fs.existsSync( path ) ) {
	 for( let i = 0; ; i++ ) {
	    let file = path + "-" + i;
	    if( !fs.existsSync( file ) ) return file;
	 }
      } else {
	 return path;
      }
   }
   
   makeDirectories( config.queue );

   const mid = message.msg.match( /^[ \t]*Message-ID:[ \t]*([^\r\n]+)/im );
   if( mid ) {
      let p = newName( path.join( config.queue, mid[ 1 ] ) );
      let fd = fs.openSync( p, "w" );
      let buf = iconv.encode( message.msg, "latin1" );
      fs.writeSync( fd, buf, 0, buf.length, null );
      fs.closeSync( fd );
   } else {
      throw "Cannot find message id, not queing.";
   }
}
   
/*---------------------------------------------------------------------*/
/*    outOfMail ...                                                    */
/*---------------------------------------------------------------------*/
function outOfMail( config ) {
   if( "outOfMail" in config ) {
      let dt = new Date();
      
      // checking hours
      if( config.outOfMail.hours && config.outOfMail.hours instanceof Array ) {
	 let hours = config.outOfMail.hours;
	 let h = dt.getHours();
	 
	 for( let i = 0; i < hours.length; i++ ) {
	    if( hours[ i ] === h ) {
	       return true;
	    }
	    if( hours[ i ] instanceof Array
		&& (hours[ i ][ 0 ] <= h && hours[ i ][ 1 ] >= h) ) {
	       return true;
	    }
	 }
      }
      
      // checking days
      if( config.outOfMail.days && config.outOfMail.days instanceof Array ) {
	 let d = [ "sun", "mon", "tue", "wed", "thu", "fri", "sat" ][ dt.getDay() ];

	 return config.outOfMail.days.indexOf( d ) >= 0;
      }
   }

   return false;
}
   
/*---------------------------------------------------------------------*/
/*    sendp ...                                                        */
/*---------------------------------------------------------------------*/
function sendp( config, msg ) {
   
   function immediateDelivery( msg ) {
      debug( "immedia msg=", msg );
      debug( "immedia msg.target=", msg.target );
      return msg.target.find( function( tgt ) {
	 return config.immediateDelivery.indexOf( tgt.toLowerCase() ) >= 0;
      } )
   }

   if( config.args.os ) {
      debug( "queuing (out-of-mail, command line)" );
      return false;
   }
   if( config.args.force ) {
      return true;
   }
   if( msg && immediateDelivery( msg ) ) {
      return true;
   }
   if( outOfMail( config ) ) {
      debug( "queuing (out-of-mail, json)" );
      return false;
   }
   if( ("outOfMail" in config.rc) ? config.rc.outOfMail( config ) : false ) {
      debug( "queuing (out-of-mail, rc)" );
      return false;
   }
   if( config.state.outOfMail ) {
      debug( "queuing (out-of-mail, state)" );
      return false;
   }
   
   return true;
}

/*---------------------------------------------------------------------*/
/*    sendOrQueue ...                                                  */
/*---------------------------------------------------------------------*/
function sendOrQueue( config, msg, immediate ) {
   debug( "sendOrQueue message [" + msg.msg.length + "] immediate=" + immediate );
   
   if( immediate || sendp( config, msg ) ) {
      const servers = findMessageServers( config, msg );
      
      if( !servers ) {
      	 debug( "no servers for message" );
      	 syslog.log( syslog.LOG_ERROR, "No suitable server message for " + message.from
+ " uid=" + process.getuid()
+ " username=" + (process.env.USERNAME || process.env.LOGNAME)
+ " outbytes=" + message.msg.length
+ err.toString() );
	 
      	 return Promise.reject( "No suitable server" );
      } else {
      	 debug( "found suitable servers ", servers.map( s => s.host + ":" + s.port ) );
      	 
	 return openMessageConnection( msg, servers )
	    .then( conn => conn.sendMessage( config, msg ) )
	    .then( o => { if( !immediate ) return flushMessageQueue( config ) } )
	    .catch( err => {
		   messageQueue( config, msg );
		})
      }
   } else {
      debug( "message queued [" + msg.msg.length + "]" );
      
      messageQueue( config, msg );
      return Promise.resolve( true );
   }
}  

/*---------------------------------------------------------------------*/
/*    main ...                                                         */
/*---------------------------------------------------------------------*/
async function main() {
   const argv = process.argv.slice( hop.standalone ? 1 : 2 );
   const minimist = require( 'minimist' );
   args = minimist( argv, { names: ["-oi", "-bp", "-oQ", "-os"] });

   if( args.h || args.help ) {
      console.log( "hopsmpt v" + require( "./configure.js" ).version );
      console.log( "usage: hopsmpt [options] ..." );
      console.log( "" );
      console.log( "Options:" );
      console.log( "  -h|--help  This message" );
      console.log( "  -bp        Print a summary of the mail queue" );
      console.log( "  -Mid       Attempt to deliver the queued message with id" );
      console.log( "  -Rstr      Process queue for recipient" );
      console.log( "  -oQdir     Select the queue directory" );
      console.log( "  -os        Enqueue message" );
      console.log( "  -q         Process the queue" );
      console.log( "  -f         sender address" );
      console.log( "  -wq        Process the queue only if in work period" );
      console.log( "  -t         Read message, searching for recipients" );
      console.log( "  --force    Force sending immediately" );
      console.log( "  --nocdb    Do not load contact database" );
      console.log( "  -g         Internal debug" );
      process.exit( 0 );
   }

   var config = loadConfig( args );
   var rc = loadRC();
   var state = loadState();

   config.args = args;
   config.rc = rc;
   config.state = state;

   if( args.g === true ) {
      dbg = {
	 fd: fs.openSync( config.log || "/tmp/hopsmtp.log", "a" ),
	 date: new Date()
      }
      syslog = {
	 log: function( ...args ) { debug.apply( undefined, args ) },
         LOG_INFO: "info: ",
	 LOG_ERROR: "error: ",
	 open: function( path, mode ) { }
      }
      console.error( "logging message to \"/tmp/hopsmt.log\"" );
   }
   if( args.oQ ) {
      config.queue = args.oQ;
   }
   
   if( !args.nocdb && config.contacts ) {
      // load the contact database
      cdb = loadCDB( config.contacts );
   }
   
   if( args.queue === "on" ) {
      setQueuing( true );
      exit( 0 );
   } else if( args.queue === "off" ) {
      setQueuing( false );
      exit( 0 );
   } 

   if( args.action === "show" || args.bp ) {
      debug( "showing the queue" );
      await showQueue( config ); 
      exit( 0 );
   } else if( config.args.q ) {
      debug( "process the queue" );
      flushMessageQueue( config )
	 .then( o => exit( 0 ) )
	 .catch( o => fail( o, 1 ) );
   } else if( config.args.wq ) {
      debug( "process the queue unless out-of-mail" );
      if( sendp( config, undefined ) ) {
	 flushMessageQueue( config )
	    .then( o => exit( 0 ) )
	    .catch( o => fail( o, 1 ) );
      }
   } else if( config.args.M ) {
      debug( "sending from queue MID=" + config.args.M );
      sendMidMessageQueue( config, config.args.M )
	 .then( o => exit( 0 ) )
	 .catch( o => fail( o, 1 ) );
   } else if( config.args.R ) {
      debug( "sending from queue RECIPIENT=" + config.args.R );
      sendRecipientMessageQueue( config, false, config.args.R )
	 .then( o => exit( 0 ) )
	 .catch( o => fail( o, 1 ) );
   } else {
      syslog.open( "hopsmtp", syslog.LOG_PID | syslog.LOG_ODELAY );

      readMessage( process.stdin )
	 .then( o => sendOrQueue( config, o, args.force ) )
	 .then( o => exit( 0 ) )
	 .catch( o => fail( o, 1 ) );
   }
}

main();
