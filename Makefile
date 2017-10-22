#*=====================================================================*/
#*    serrano/prgm/utils/hopsmtp/Makefile                              */
#*    -------------------------------------------------------------    */
#*    Author      :  Manuel Serrano                                    */
#*    Creation    :  Tue Oct  4 14:43:55 2016                          */
#*    Last change :  Mon Oct 23 01:08:22 2017 (serrano)                */
#*    Copyright   :  2016-17 Manuel Serrano                            */
#*    -------------------------------------------------------------    */
#*    install                                                          */
#*=====================================================================*/
BINDIR=/usr/local/bin
LIBDIR=/usr/local/lib/hopsmtp
RELEASE=0.1.1

HOP = hop
HOPC = hopc
HFLAGS = -O2

ICONVLIB = index.js streams.js bom-handling.js extend-node.js
ICONVENC = dbcs-codec.js index.js sbcs-codec.js sbcs-data.js utf16.js \
  dbcs-data.js internal.js sbcs-data-generated.js utf7.js
ICONV = $(ICONVLIB:%=lib/%) $(ICONVENC:%=encodings/%)

MINIMIST = index.js

SMTPLIB = data-stream.js smtp-connection.js
SMTP = $(SMTPLIB:%=lib/%)

OBJECTS = hopsmtp.js \
  $(ICONV:%=node_modules/iconv-lite/%) \
  $(MINIMIST:%=node_modules/minimist/%) \
  $(SMTP:%=node_modules/smtp-connection/%)

SOFILES = $(OBJECTS:%.js=%.so)

SODIR= /usr/local/lib/hopsmtp/0.1.1/libs/3.2.0/1fc6834d303cd051f8a15d5f2c180af0/linux-i686

LIBS=$(SOFILES:%=libs/%)

#*---------------------------------------------------------------------*/
#*    do:                                                              */
#*---------------------------------------------------------------------*/
do: $(SOFILES)

#*---------------------------------------------------------------------*/
#*    .suffixes                                                        */
#*---------------------------------------------------------------------*/
.SUFFIXES:
.SUFFIXES: .js .so

#*---------------------------------------------------------------------*/
#*    The implicit rules                                               */
#*---------------------------------------------------------------------*/
%.so: %.js
	$(HOPC) $(HFLAGS) -y -o $@ $< 

#*---------------------------------------------------------------------*/
#*    install                                                          */
#*---------------------------------------------------------------------*/
install:
	cp bin/hopsmtp $(BINDIR)/hopsmtp && chmod a+rx $(BINDIR)/hopsmtp
	cp bin/hopsmtp $(BINDIR)/hopsmtp
	mkdir -p $(LIBDIR)
	mkdir -p $(LIBDIR)/$(RELEASE)
	mkdir -p $(SODIR)
	cp -rf node_modules $(LIBDIR)/$(RELEASE)
	cp -rf hopsmtp.js $(LIBDIR)/$(RELEASE)
	cp -rf configure.js $(LIBDIR)/$(RELEASE)
	for p in $(OBJECTS:%.js=%.so); do \
           b=`basename $$p .so`; \
           qf=$(SODIR)/$$p; \
           t=`$(HOP) --no-zeroconf --no-server --eval "(print (string-append \"$$b-\" (md5sum \"$$qf\") \".so\"))"`; \
	   echo "cp $$p $(SODIR)/$$t"; \
	   cp $$p $(SODIR)/$$t; \
        done
	chmod a+rx -R $(LIBDIR)

#*---------------------------------------------------------------------*/
#*    clean                                                            */
#*---------------------------------------------------------------------*/
clean:
	rm -f $(SOFILES)
