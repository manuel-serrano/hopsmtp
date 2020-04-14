Edit the file hopsmtp.json then copy it into

  $HOME/.config/hop/hopsmtp/hopsmtp.json

To test:

  bin/hopsmtp -t < mail.example

To debug if something goes wrong with compiled files:

  sh -x bin/hopsmtp -t < mail.example
