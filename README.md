Edit the file hopsmtp.json then copy it into

  $HOME/.config/hop/hopsmtp/hopsmtp.json

To test:

  bin/hopsmtp -t < mail.example


To debug if something goes wrong with compiled files:

  hop -v10 --no-zeroconf --so-policy nte1 -q --no-server --so-dir /usr/local/lib/hopsmtp/0.2.0/so -- /usr/local/lib/hopsmtp/0.2.0/hopsmtp.js < mail.example
