/* eslint-disable no-alert */

// = require decidim-bulletin_board
// = require ../identification_keys

/**
 * This file is responsible to generate election keys,
 * create a backup of keys for the trustee and
 * update the election bulletin board status
 */

$(() => {
  const $keyCeremony = $(".key-ceremony");
  const $startButton = $keyCeremony.find(".start");
  const $backButton = $keyCeremony.find(".back");
  const $backupModal = $("#backup-modal");
  const $backupButton = $backupModal.find(".download-election-keys");
  const $restoreModal = $("#restore-modal");
  const $restoreButton = $restoreModal.find(".upload-election-keys");


  const electionKeyIdentifier = `${$keyCeremony.data("trusteeUniqueId")}-election-${$keyCeremony.data(
    "electionId"
  )}`;

  let wrapperState = "";
  let currentStep = null;

  const trusteeContext = {
    uniqueId: $keyCeremony.data("trusteeUniqueId"),
    publicKeyJSON: JSON.stringify($keyCeremony.data("trusteePublicKey"))
  };
  const identificationKeys = new window.Decidim.IdentificationKeys(
    trusteeContext.uniqueId,
    trusteeContext.publicKeyJSON
  );

  // updates the BulletinBoard Election Status
  const updateElectionStatus = () => {
    $.ajax({
      method: "PUT",
      url: $keyCeremony.data("updateElectionStatusUrl"),
      contentType: "application/json",
      headers: {
        "X-CSRF-Token": $("meta[name=csrf-token]").attr("content")
      }
    });
  };

  const getStepRow = (step) => {
    return $("#" + step.replace(".", "-"))
  }

  const completeProcess = () => {
    const $previousStep = getStepRow(currentStep);
    $previousStep.find(".processing").addClass("hide");
    $previousStep.find(".completed").removeClass("hide");

    $startButton.addClass("hide");
    $backButton.removeClass("hide");
    updateElectionStatus();
  };

  // generates the keys
  identificationKeys.present(async (exists) => {
    if (exists) {
      const {
        Client,
        KeyCeremony,
        MessageIdentifier
      } = window.decidimBulletinBoard;

      const bulletinBoardClient = new Client({
        apiEndpointUrl: $keyCeremony.data("apiEndpointUrl"),
        wsEndpointUrl: $keyCeremony.data("websocketUrl")
      });

      const keyCeremony = new KeyCeremony({
        bulletinBoardClient,
        electionContext: {
          id: `${$keyCeremony.data("authorityUniqueId")}.${$keyCeremony.data(
            "electionId"
          )}`,
          currentTrusteeContext: {
            id: trusteeContext.uniqueId,
            identificationKeys
          }
        }
      });

      await keyCeremony.setup();

      if (keyCeremony.restoreNeeded()) {
        $restoreModal.foundation("open");
      } else {
        $startButton.removeClass("disabled");
      }

      $startButton.on("click", async () => {
        $startButton.addClass("disabled");
        keyCeremony.run();
      });

      $backupButton.on("click", async () => {
        return new Promise((resolve, reject) => {
          try {
            let element = document.createElement("a");
            element.setAttribute(
              "href",
              `data:text/plain;charset=utf-8,${wrapperState}`
            );
            element.setAttribute("download", `${electionKeyIdentifier}.bak`);
            element.style.display = "none";
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            $backupModal.foundation("close");
            keyCeremony.run();
            return resolve();
          } catch (error) {
            return reject();
          }
        });
      });

      $restoreButton.on("click", async (event) => {
        let element = document.createElement("input");
        element.setAttribute("type", "file");
        element.setAttribute("accept", ".bak");
        element.style.display = "none";
        document.body.appendChild(element);

        element.addEventListener("change", (event) => {
          document.body.removeChild(element);
          const reader = new FileReader();
          if (keyCeremony.restore(reader.readAsText(event.target.files[0]))){
            $startButton.removeClass("disabled");
            $restoreModal.foundation("close");
          } else {
            element.click();
          }
        });
        element.click();
      });

      keyCeremony.events.subscribe((event) => {
        let messageIdentifier = MessageIdentifier.parse(
          event.message.messageId
        );

        if (event.type === "[Message] Received") {
          if (currentStep && currentStep != messageIdentifier.typeSubtype) {
            const $previousStep = getStepRow(currentStep);
            $previousStep.find(".processing").addClass("hide");
            $previousStep.find(".completed").removeClass("hide");
          }
          currentStep = messageIdentifier.typeSubtype;
          const $currentStep = getStepRow(currentStep);
          $currentStep.find(".pending").toggleClass("hide", true);
          $currentStep.find(".processing").toggleClass("hide", false);
        }

        if (event.type === "[Message] Processed" && event.result) {
          if (event.result.save) {
            wrapperState = keyCeremony.backup();
            $backupModal.foundation("open");
          }

          if (event.result.done) {
            completeProcess();
          }
        }
      });
    }
  });
});
