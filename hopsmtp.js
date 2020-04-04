/*=====================================================================*/
/*    serrano/prgm/utils/hopsmtp/hopsmtp.js                            */
/*    -------------------------------------------------------------    */
/*    Author      :  Manuel Serrano                                    */
/*    Creation    :  Sat Oct  1 13:09:48 2016                          */
/*    Last change :  Sat Apr  4 07:29:32 2020 (serrano)                */
/*    Copyright   :  2016-20 Manuel Serrano                            */
/*    -------------------------------------------------------------    */
/*    hopsmtp.js                                                       */
/*=====================================================================*/
"use strict";

/*---------------------------------------------------------------------*/
/*    import                                                           */
/*---------------------------------------------------------------------*/
const SMTPConnection = require( 'smtp-connection' );
const fs = require( 'fs' );
const path = require( 'path' );
const os = require( 'os' );
const iconv = require( "iconv-lite" );
let syslog = require( hop.syslog );

/*---------------------------------------------------------------------*/
/*    constant                                                         */
/*---------------------------------------------------------------------*/
const RCbase = "hopsmtp";

/*---------------------------------------------------------------------*/
/*    Global variables                                                 */
/*---------------------------------------------------------------------*/
var config;
var dbg = false;

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
	       console.log( "     to:", msg.all.join( ", " ) );
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
      
      stream.on( 'data', data => {
	 msg += iconv.decode( data, "latin1" );
      } );

      stream.on( 'end', data => {
	 const sep = msg.match( /(?:\r?\n){2}/ );

	 if( sep ) {
	    const hd = msg.substring( msg, sep.index );
	    const to = hd.match( /^[ \t]*To:[ \t]*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/mi );
	    const cc = hd.match( /^[ \t]*cc:[ \t]*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/mi );
	    const bcc = hd.match( /^[ \t]*bcc:[ \t]*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/mi );
	    const from = hd.match( /^[ \t]*From:[ \t]*([^\r\n]+)/mi );

	    if( to ) {
	       let receivers = normalizeEmails( to[ 1 ] );

	       if( cc ) {
		  const ccs = normalizeEmails( cc[ 1 ] );
		  receivers = receivers.concat( ccs );
	       }

	       if( bcc ) {
		  const bccs = normalizeEmails( bcc[ 1 ] );
		  receivers = receivers.concat( bccs );
	       }
	       debug( "receivers=", receivers );

	       resolve( { to: to,
			  all: receivers,
			  from: normalizeEmail( from ? from[ 1 ] : args.f ),
			  head: hd,
			  msg: msg } );
	    } else {
	       reject( "Cannot find destination address" );
	    }
	 } else {
	    reject( "Cannot find header" );
	 }
      } );
   } );
}

/*---------------------------------------------------------------------*/
/*    sendMessage ...                                                  */
/*---------------------------------------------------------------------*/
function sendMessage( config, conn, message ) {
   return new Promise( function( resolve, reject ) {
      function logSent( info ) {
	 syslog.log( syslog.LOG_INFO, "Sent mail for " + message.from
		     + " (" + conn.config.host + ")"
		     + " uid=" + process.getuid()
		     + " username=" + (process.env.USERNAME || process.env.LOGNAME)
		     + " outbytes=" + message.msg.length );
      }

      function logError( err ) {
	 syslog.log( syslog.LOG_ERROR, "Cannot sent mail for " + message.from
		     + " (" + conn.config.host + ")"
		     + " uid=" + process.getuid()
		     + " username=" + (process.env.USERNAME || process.env.LOGNAME)
		     + " outbytes=" + message.msg.length
		     + err.toString() );
      }

      debug( "sending mail to ", message.to );
      const buf = iconv.encode( message.msg, "latin1" );
      debug( "encoded ", message.msg.length, " characters" );
      
      message.use8BitMime = true;
      
      conn.send( message, buf, (err, info) => {
	 			  debug( "sent " + (err ? info : "ok") );
	 if( err == null ) {
	    logSent( info );
	    resolve( info );
	 } else {
	    logError( err );
	    reject( err );
	 }
      } );
   } )
}

/*---------------------------------------------------------------------*/
/*    flushMessageQueue ...                                            */
/*---------------------------------------------------------------------*/
function flushMessageQueue( config, conn ) {
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
	       readMessage( fs.createReadStream( p ) )
		  .then( o => sendMessage( config, conn, o ) )
		  .then( o => fs.unlinkSync( p ) )
		  .then( sendNextInQueueFile )
		  .catch( sendNextInQueueFile )
	          .then( o => fs.close(), o => fs.close() )
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
function sendMidMessageQueue( config, conn, mid ) {
   const files = fs.readdirSync( config.queue );
   const i = files.indexOf( mid );

   if( i ) {
      let p = path.join( config.queue, files[ i ] );
      return readMessage( fs.createReadStream( p ) )
	 .then( o => sendMessage( config, conn, o ) )
	 .then( o => fs.unlinkSync( p ) )
	 .then( o => fs.close(), o => fs.close() )
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
	       readMessage( fs.createReadStream( p ) )
		  .then( o => {
		     if( o.receivers.indexOf( recipient ) ) {
			return sendMessage( config, conn, o )
			   .then( o => fs.unlinkSync( p ) );
		     } else {
			return o;
		     }
		  } )
		  .then( sendNextInQueueFile )
		  .catch( sendNextInQueueFile )
		  .then( o => fs.close(), o => fs.close() )
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
/*    openSMTPConnection ...                                           */
/*---------------------------------------------------------------------*/
function openSMTPConnection( config ) {
   
   function open( server ) {
      syslog.log( syslog.LOG_INFO, 
	 "Creating "
	 + ((server.secure || server.requireTLS) ? "SSL" : "")
	 + " connection to " + server.host );
      debug( "connecting to " + server.host );
      return new Promise( function( resolve, reject ) {
      	 const conn = new SMTPConnection( server );
      	 conn.on( 'error', reject );
      	 conn.connect( v => conn.login( server.login, () => resolve( conn ) ) );
      } );
   }
   
   function loop( resolve, reject, i ) {
      debug( "in loop i=", i, " len=", config.servers.length );
      if( i >= config.servers.length ) {
	 reject( "no server available!" );
      } else {
	 const server = config.servers[ i ];
	 debug( "trying server: ", 
	    config.servers[ i ].host + ":" + config.servers[ i ].port );
	 return open( server )
	    .then( conn => { 
	       debug( "connection succeeded: ", server );
	       conn.config = server; resolve( conn ) 
	    },
	       err => {
   		  debug( "connection failed: ", server );
   		  loop( resolve, reject, i + 1 );
	       } )
      }
   }
   
   return new Promise( (resolve, reject) => loop( resolve, reject, 0 ) );
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
/*    exit ...                                                         */
/*---------------------------------------------------------------------*/
function exit( conn, status ) {
   if( dbg ) {
      fs.closeSync( dbg.fd );
   }
   if( conn ) {
      conn.quit();
   }
   process.exit( status );
}

/*---------------------------------------------------------------------*/
/*    fail ...                                                         */
/*---------------------------------------------------------------------*/
function fail( conn, msg, status ) {
   console.log( msg );
   debug( msg );
   exit( conn, status );
}

/*---------------------------------------------------------------------*/
/*    sendp ...                                                        */
/*---------------------------------------------------------------------*/
function sendp( config, msg ) {
   
   function immediateDelivery( msg ) {
      console.debug( "Immediate msg=", msg );
      return msg.to.find( function( to ) {
	 return config.immediateDelivery.indexOf( to.toLowerCase() ) >= 0;
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
/*    onSmtpConnect ...                                                */
/*---------------------------------------------------------------------*/
function onSmtpConnect( config, conn ) {
   debug( "connection established \""
	  + conn.config.host + ":" + conn.config.port + "\"" );

   if( config.args.q ) {
      debug( "process the queue" );
      flushMessageQueue( config, conn )
	 .then( o => exit( conn, 0 ) )
	 .catch( o => fail( conn, o, 1 ) );
   } else if( config.args.wq ) {
      debug( "process the queue unless out-of-mail" );
      if( sendp( config, undefined ) ) {
	 flushMessageQueue( config, conn )
	    .then( o => exit( conn, 0 ) )
	    .catch( o => fail( conn, o, 1 ) );
      }
   } else if( config.args.M ) {
      debug( "sending from queue MID=" + config.args.M );
      sendMidMessageQueue( config, conn, config.args.M, false )
	 .then( o => exit( conn, 0 ) )
	 .catch( o => fail( conn, o, 1 ) );
   } else if( config.args.R ) {
      debug( "sending from queue RECIPIENT=" + config.args.R );
      sendRecipientMessageQueue( config, conn, false, config.args.R )
	 .then( o => exit( conn, 0 ) )
	 .catch( o => fail( conn, o, 1 ) );
   } else {
      debug( "reading mail from stdin..." );
      readMessage( process.stdin )
	 .then( msg => {
	    debug( "message read [" + msg.msg.length + "]" );
	    if( sendp( config, msg ) ) {
	       debug( "start sending message..." );
	       sendMessage( config, conn, msg )
		  .then( o => { if( !config.args.force ) return flushMessageQueue( config, conn ) } )
		  .then( o => exit( conn, 0 ) )
		  .catch( o => fail( conn, o, 1 ) );
	       
	    } else {
	       debug( "queuing message..." );
	       messageQueue( config, msg );
	       exit( conn, 0 );
	    }
	 } )
   }
}

/*---------------------------------------------------------------------*/
/*    onSmtpError ...                                                  */
/*---------------------------------------------------------------------*/
function onSmtpError( config, err ) {
   syslog.log( syslog.LOG_ERR, "Cannot connect: " + err.toString() );
   
   var msg = "Cannot connect to \"" + err.toString() + "\"";
   debug( msg, err );
   
   if( !config.args.q ) {
      debug( "reading message" );
      readMessage( process.stdin )
	 .then( msg => messageQueue( config, msg ) )
	 .then( o => exit( false, 0 ) )
	 .catch( o => exit( false, 1 ) );
   } else {
      exit( false, 1 );
   }
}

/*---------------------------------------------------------------------*/
/*    main ...                                                         */
/*---------------------------------------------------------------------*/
async function main() {
   const argv = process.argv.slice( hop.standalone ? 1 : 2 );
   const minimist = require( 'minimist' );
   const args = minimist( argv, { names: ["-oi", "-bp", "-oQ", "-os"] });

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
      console.log( "  -wq        Process the queue only if in work period" );
      console.log( "  -t         Read message, searching for recipients" );
      console.log( "  --force    Force sending immediately" );
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
   }
   if( args.oQ ) {
      config.queue = args.oQ;
   }

   if( args.queue === "on" ) {
      setQueuing( true );
      exit( false, 0 );
   } else if( args.queue === "off" ) {
      setQueuing( false );
      exit( false, 0 );
   } 
	  
   if( args.action === "show" || args.bp ) {
      await showQueue( config ); 
      exit( false, 0 );
   } else {
      syslog.open( "hopsmtp", syslog.LOG_PID | syslog.LOG_ODELAY );

      openSMTPConnection( config )
	 .then( conn => onSmtpConnect( config, conn ) )
	 .catch( err => onSmtpError( config, err ) );
   }
}

main();
