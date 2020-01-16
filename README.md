Edit the file hopsmtp.json then copy it into

  $HOME/.config/hop/hopsmtp/hopsmtp.json

To test:

  bin/hopsmtp -t < mail.example


To debug if something goes wrong with compiled files:

  hop -v10 --no-zeroconf --sofile-policy nte1 -q --no-server --libs-dir /usr/local/lib/hopsmtp/0.2.0/libs -- /usr/local/lib/hopsmtp/0.2.0/hopsmtp.js < mail.example
