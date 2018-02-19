#*=====================================================================*/
#*    serrano/prgm/utils/hopsmtp/Makefile.in                           */
#*    -------------------------------------------------------------    */
#*    Author      :  Manuel Serrano                                    */
#*    Creation    :  Tue Oct  4 14:43:55 2016                          */
#*    Last change :  Mon Feb  5 19:20:27 2018 (serrano)                */
#*    Copyright   :  2016-18 Manuel Serrano                            */
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

SODIR= /usr/local/lib/hopsmtp/0.1.1/libs/3.2.0/39c13560d0bec8064aaa5f7b85299bff/linux-x86_64
JSDIR = $(LIBDIR)/$(RELEASE)

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
install: install-libs
	cp bin/hopsmtp $(BINDIR)/hopsmtp && chmod a+rx $(BINDIR)/hopsmtp
	cp bin/hopsmtp $(BINDIR)/hopsmtp
	mkdir -p $(LIBDIR)
	mkdir -p $(LIBDIR)/$(RELEASE)
	cp -rf node_modules $(LIBDIR)/$(RELEASE)
	cp -rf hopsmtp.js $(LIBDIR)/$(RELEASE)
	cp -rf configure.js $(LIBDIR)/$(RELEASE)
	chmod a+rx -R $(LIBDIR)

install-libs:
	mkdir -p $(SODIR)
	for p in $(OBJECTS:%.js=%); do \
           t=`$(HOP) --no-server --eval "(print (basename (hop-sofile-path \"$(JSDIR)/$$p.js\")))"`; \
	   cp $$p.so $(SODIR)/`basename $$t`; \
        done

#*---------------------------------------------------------------------*/
#*    clean                                                            */
#*---------------------------------------------------------------------*/
clean:
	rm -f $(SOFILES)
