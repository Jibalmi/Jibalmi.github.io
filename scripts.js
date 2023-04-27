let selectedTerminal = '';

function goBack(showWindowId, hideWindowId) {
    document.getElementById(showWindowId).style.display = 'block';
    document.getElementById(hideWindowId).style.display = 'none';
}

function showTerminalSelection() {
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('terminal-selection').style.display = 'block';
}

function selectTerminal(terminal) {
    // Save the selected terminal and proceed to the next step
    console.log('Selected terminal:', terminal);
    // ...
}


function selectTerminal(terminal) {
    selectedTerminal = terminal;
    document.getElementById('terminal-selection').style.display = 'none';
    document.getElementById('gate-selection').style.display = 'block';

    // Update the gate selection content based on the selected terminal
    updateGateSelectionContent();
}
function updateGateSelectionContent() {
    // Set default min and max values for gate input
    let minGate = 1;
    let maxGate = 21;

    // Update min and max values based on the selected terminal
    switch (selectedTerminal) {
        case 'A':
            minGate = 1;
            maxGate = 21;
			const gateNumberInputA = document.getElementById('gate-numberA');
			gateNumberInputA.min = minGate;
			gateNumberInputA.max = maxGate;
            break;
		case 'B':
            minGate = 1;
            maxGate = 38;
			const gateNumberInputB = document.getElementById('gate-numberB');
			gateNumberInputB.min = minGate;
			gateNumberInputB.max = maxGate;
            break;
		case 'C':
            minGate = 1;
            maxGate = 42;
			const gateNumberInputC = document.getElementById('gate-numberC');
			gateNumberInputC.min = minGate;
			gateNumberInputC.max = maxGate;
            break;
		case 'E':
            minGate = 1;
            maxGate = 12;
			const gateNumberInputD = document.getElementById('gate-numberE');
			gateNumberInputD.min = minGate;
			gateNumberInputD.max = maxGate;
            break;
    }

    // Update the input field for gate number with the new min and max values
    
}




function selectTerminal(terminal) {
    selectedTerminal = terminal;
    document.getElementById('terminal-selection').style.display = 'none';
    switch (selectedTerminal) {
        case 'A':
            document.getElementById('gate-selectionA').style.display = 'block';
            break;
		case 'B':
            document.getElementById('gate-selectionB').style.display = 'block';
            break;
		case 'C':
            document.getElementById('gate-selectionC').style.display = 'block';
            break;
		case 'E':
            document.getElementById('gate-selectionE').style.display = 'block';
            
            break;
	}

    // Update the gate selection content based on the selected terminal
    updateGateSelectionContent();
}



function selectGateA() {
    const gateNumber = document.getElementById('gate-numberA').value;

    if (gateNumber >= 1 && gateNumber <= 10) {
		createSleepingPods('range-1-10');
        document.getElementById('gate-selectionA').style.display = 'none';
        document.getElementById('range-1-10').style.display = 'block';
		
    } else if (gateNumber >= 11 && gateNumber <= 21) {
		createSleepingPods('range-11-21');
        document.getElementById('gate-selectionA').style.display = 'none';
        document.getElementById('range-11-21').style.display = 'block';
		
    } else {
        alert('Invalid gate number. Please enter a real gate do not include any letters.');
    }
}
function selectGateB() {
    const gateNumber = document.getElementById('gate-numberB').value;

    if (gateNumber >= 1 && gateNumber <= 9) {
		const sleepingPodsContainer = document.getElementById('sleeping-pods-containerB');
			sleepingPodsContainer.innerHTML = '';
			sleepingPodsData.forEach((pod) => {
        const podElement = document.createElement('div');
			podElement.classList.add('sleeping-pod');
			podElement.classList.add(pod.available ? 'available' : 'occupied');
			podElement.setAttribute('data-pod-id', pod.id);
			podElement.onclick = function () {
            if (pod.available) {
                openReservationPopup(pod.id);
            }
        };

        // Add pod number in the center of the rectangle
        const podNumber = document.createElement('span');
        podNumber.classList.add('pod-number');
        podNumber.innerText = pod.id;
        podElement.appendChild(podNumber);

        sleepingPodsContainer.appendChild(podElement);
    });
        document.getElementById('gate-selectionB').style.display = 'none';
        document.getElementById('range-1-9').style.display = 'block';
		
    } else if (gateNumber >= 10 && gateNumber <= 24) {
		const sleepingPodsContainer = document.getElementById('sleeping-pods-containerB');
  sleepingPodsContainer.innerHTML = '';
    sleepingPodsData.forEach((pod) => {
        const podElement = document.createElement('div');
        podElement.classList.add('sleeping-pod');
        podElement.classList.add(pod.available ? 'available' : 'occupied');
        podElement.setAttribute('data-pod-id', pod.id);
        podElement.onclick = function () {
            if (pod.available) {
                openReservationPopup(pod.id);
            }
        };

        // Add pod number in the center of the rectangle
        const podNumber = document.createElement('span');
        podNumber.classList.add('pod-number');
        podNumber.innerText = pod.id;
        podElement.appendChild(podNumber);

        sleepingPodsContainer.appendChild(podElement);
    });
        document.getElementById('gate-selectionB').style.display = 'none';
        document.getElementById('range-10-24').style.display = 'block';
		
    } else if(gateNumber >= 25 && gateNumber <= 38) {
		const sleepingPodsContainer = document.getElementById('sleeping-pods-containerB');
  sleepingPodsContainer.innerHTML = '';
    sleepingPodsData.forEach((pod) => {
        const podElement = document.createElement('div');
        podElement.classList.add('sleeping-pod');
        podElement.classList.add(pod.available ? 'available' : 'occupied');
        podElement.setAttribute('data-pod-id', pod.id);
        podElement.onclick = function () {
            if (pod.available) {
                openReservationPopup(pod.id);
            }
        };

        // Add pod number in the center of the rectangle
        const podNumber = document.createElement('span');
        podNumber.classList.add('pod-number');
        podNumber.innerText = pod.id;
        podElement.appendChild(podNumber);

        sleepingPodsContainer.appendChild(podElement);
    });
        document.getElementById('gate-selectionB').style.display = 'none';
        document.getElementById('range-25-38').style.display = 'block';
		
	}	else {
        alert('Invalid gate number. Please enter a real gate do not include any letters.');
    }
}
function selectGateC() {
    const gateNumber = document.getElementById('gate-numberC').value;

    if (gateNumber >= 8 && gateNumber <= 21) {
		const sleepingPodsContainer = document.getElementById('sleeping-pods-containerC');
  sleepingPodsContainer.innerHTML = '';
    sleepingPodsData.forEach((pod) => {
        const podElement = document.createElement('div');
        podElement.classList.add('sleeping-pod');
        podElement.classList.add(pod.available ? 'available' : 'occupied');
        podElement.setAttribute('data-pod-id', pod.id);
        podElement.onclick = function () {
            if (pod.available) {
                openReservationPopup(pod.id);
            }
        };

        // Add pod number in the center of the rectangle
        const podNumber = document.createElement('span');
        podNumber.classList.add('pod-number');
        podNumber.innerText = pod.id;
        podElement.appendChild(podNumber);

        sleepingPodsContainer.appendChild(podElement);
    });
        document.getElementById('gate-selectionC').style.display = 'none';
        document.getElementById('range-8-21').style.display = 'block';
		
    } else if (gateNumber >= 25 && gateNumber <= 42) {
		const sleepingPodsContainer = document.getElementById('sleeping-pods-containerC');
  sleepingPodsContainer.innerHTML = '';
    sleepingPodsData.forEach((pod) => {
        const podElement = document.createElement('div');
        podElement.classList.add('sleeping-pod');
        podElement.classList.add(pod.available ? 'available' : 'occupied');
        podElement.setAttribute('data-pod-id', pod.id);
        podElement.onclick = function () {
            if (pod.available) {
                openReservationPopup(pod.id);
            }
        };

        // Add pod number in the center of the rectangle
        const podNumber = document.createElement('span');
        podNumber.classList.add('pod-number');
        podNumber.innerText = pod.id;
        podElement.appendChild(podNumber);

        sleepingPodsContainer.appendChild(podElement);
    });
        document.getElementById('gate-selectionC').style.display = 'none';
        document.getElementById('range-25-42').style.display = 'block';
		
    } else {
        alert('Invalid gate numberneeds to be between8->21 or 25->42. Please enter a real gate do not include any letters.');
    }
}
function selectGateE() {
    const gateNumber = document.getElementById('gate-numberE').value;

    if (gateNumber >= 1 && gateNumber <= 12) {
		const sleepingPodsContainer = document.getElementById('sleeping-pods-containerE');
  sleepingPodsContainer.innerHTML = '';
    sleepingPodsData.forEach((pod) => {
        const podElement = document.createElement('div');
        podElement.classList.add('sleeping-pod');
        podElement.classList.add(pod.available ? 'available' : 'occupied');
        podElement.setAttribute('data-pod-id', pod.id);
        podElement.onclick = function () {
            if (pod.available) {
                openReservationPopup(pod.id);
            }
        };

        // Add pod number in the center of the rectangle
        const podNumber = document.createElement('span');
        podNumber.classList.add('pod-number');
        podNumber.innerText = pod.id;
        podElement.appendChild(podNumber);

        sleepingPodsContainer.appendChild(podElement);
    });
        document.getElementById('gate-selectionE').style.display = 'none';
        document.getElementById('range-1-12').style.display = 'block';
			
    } else {
        alert('Invalid gate number. Please enter a real gate do not include any letters.');
    }
}

function goBack(showWindowId, hideWindowId) {
    document.getElementById(showWindowId).style.display = 'block';
    document.getElementById(hideWindowId).style.display = 'none';
}

// Demo data for sleeping pod availability
const sleepingPodsData = [
    { id: 1, available: true },
    { id: 2, available: false },
    { id: 3, available: true },
    { id: 4, available: true },
    { id: 5, available: false },
    { id: 6, available: true },
    { id: 7, available: false },
    { id: 8, available: true },
    { id: 9, available: true },
    { id: 10, available: true },
];
function createSleepingPods(range) {
  const sleepingPodsContainer = document.getElementById('sleeping-pods-container');
  sleepingPodsContainer.innerHTML = '';
    sleepingPodsData.forEach((pod) => {
        const podElement = document.createElement('div');
        podElement.classList.add('sleeping-pod');
        podElement.classList.add(pod.available ? 'available' : 'occupied');
        podElement.setAttribute('data-pod-id', pod.id);
        podElement.onclick = function () {
            if (pod.available) {
                openReservationPopup(pod.id);
            }
        };

        // Add pod number in the center of the rectangle
        const podNumber = document.createElement('span');
        podNumber.classList.add('pod-number');
        podNumber.innerText = pod.id;
        podElement.appendChild(podNumber);

        sleepingPodsContainer.appendChild(podElement);
    });
	
}


function openReservationPopup(podId) {
    document.getElementById('pod-id').innerText = podId;
    document.getElementById('reservation-popup').style.display = 'block';

    // Clear input fields
    document.getElementById('reservation-date').value = '';
    document.getElementById('start-time').value = '';
    document.getElementById('end-time').value = '';
    document.getElementById('total-cost').innerText = '$0';
}
function closeReservationPopup() {
    document.getElementById('reservation-popup').style.display = 'none';
}
function calculateTotalCost() {
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;

    if (startTime && endTime) {
        const start = new Date(`1970-01-01T${startTime}:00`);
        const end = new Date(`1970-01-01T${endTime}:00`);

        const durationMinutes = (end - start) / 1000 / 60;
        const costPerMinute = 3 / 15;
        const totalCost = durationMinutes * costPerMinute;

        document.getElementById('total-cost').innerText = `$${totalCost.toFixed(2)}`;
    } else {
        document.getElementById('total-cost').innerText = '$0';
    }
}
// Add this function

function reservePod() {
  const startTime = document.getElementById('start-time').value;
  const endTime = document.getElementById('end-time').value;
  const date = document.getElementById('reservation-date').value;

  if (!startTime || !endTime || !date) {
    alert('Please fill in all fields.');
    return;
  }

 const start = new Date(`1970-01-01T${startTime}:00`);
        const end = new Date(`1970-01-01T${endTime}:00`);

        const durationInMinutes = (end - start) / 1000 / 60;
        const costPerMinute = 3 / 15;
        const totalCost = durationInMinutes * costPerMinute;
 
  const totalTime = durationInMinutes;


  showCartPopup(totalTime, totalCost);
}
function showCartPopup(totalTime, totalCost) {
  document.getElementById('total-time').textContent = totalTime;
  document.getElementById('total-costa').textContent = totalCost;
  document.getElementById('cart-popup').classList.remove('hidden');
}

function closeCartPopup() {
  document.getElementById('cart-popup').classList.add('hidden');
}